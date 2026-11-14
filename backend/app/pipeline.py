"""NOVA TERRA LABS data pipeline.

Downloads real data for every candidate site, computes terrain and climate metrics,
drapes Sentinel-2 imagery over the DEM and writes:

    <out>/sites.json            data contract for the front-end
    <out>/viewer/index.html     table of sites with links to the 3D viewers
    <out>/viewer/<site>.html    interactive 3D terrain viewer per site (offline)
    <out>/viewer/globe.html     3D globe with all sites (click a marker to open its viewer)

Usage (from the backend/ folder):
    python -m app.pipeline                      # all sites
    python -m app.pipeline --sites andahua,mauna-kea
    python -m app.pipeline --no-imagery         # faster, elevation colouring only
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone

import numpy as np
from affine import Affine

from .climate import climate_metrics
from .similarity import WEIGHTS, similarity
from .targets import TARGETS, diviner_prp_at, target_metrics
from .imagery import fetch_true_color
from .sites import CLIMATE_END, CLIMATE_START, HALF_KM, SITES
from .terrain import bbox, load_dem, terrain_metrics
from .viewer import build_figure, build_globe, write_globe_page, write_index, write_site_page

DECIMALS = 2

SOURCE_OF = {
    **{k: "copernicus-dem" for k in
       ("elevation_mean_m", "elevation_min_m", "elevation_max_m", "slope_mean_deg", "roughness_m")},
}
CLIMATE_KEYS = ("temp_max_mean_c", "temp_min_mean_c", "temp_range_c", "temp_abs_min_c",
                "temp_abs_max_c", "precip_annual_mm")

SOURCES = {
    "copernicus-dem": {
        "title": "Copernicus DEM GLO-30 (Copernicus Global Digital Elevation Model, 30 m)",
        "provider": "European Space Agency / Airbus",
        "doi": "https://doi.org/10.5270/ESA-c5d3d65",
        "access": "https://registry.opendata.aws/copernicus-dem/",
        "resolution": "30 m",
    },
    "nasa-power": {
        "title": "NASA POWER Daily API — T2M_MAX, T2M_MIN, PRECTOTCORR (2015–2024)",
        "provider": "NASA Langley Research Center POWER Project; meteorology from NASA GMAO MERRA-2",
        "access": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
        "period": f"{CLIMATE_START} to {CLIMATE_END}",
        "resolution": "≈50 km (MERRA-2 grid); temperatures adjusted to site elevation with 6.5 °C/km",
    },
    "diviner-prp": {
        "title": "LRO Diviner Polar Resource Product, south (DLRE_PRP_SOUTH.TAB)",
        "provider": "NASA LRO Diviner — Paige et al. (2010), Science 330, 479–482",
        "doi": "https://doi.org/10.1126/science.1187726",
        "access": "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/",
        "use": "annual maximum surface temperature and annual average temperature (2 cm depth) at the lunar target; context only, not used in the similarity index",
    },
    "open-meteo-era5": {
        "title": "Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis)",
        "provider": "Open-Meteo; ECMWF Copernicus Climate Change Service",
        "reference": "Hersbach et al. (2020), The ERA5 global reanalysis, QJRMS. https://doi.org/10.1002/qj.3803",
        "access": "https://open-meteo.com/en/docs/historical-weather-api",
        "period": f"{CLIMATE_START} to {CLIMATE_END}",
        "resolution": "≈9–25 km",
    },
    "usgs-ctx-jezero-dtm": {
        "title": "Mars 2020 Terrain Relative Navigation CTX DTM Mosaic (Jezero crater, 20 m)",
        "provider": "USGS Astrogeology Science Center — Fergason, Galuszka, Hare, Mayer & Redding (2020)",
        "doi": "https://doi.org/10.5066/P906QQT8",
        "access": "https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic",
        "resolution": "20 m (resampled to 30 m for comparison)",
    },
    "lola-south-pole-5mpp": {
        "title": "High-Resolution LOLA Topography for Lunar South Pole Sites (Site 04, Shackleton rim)",
        "provider": "NASA GSFC Planetary Geodesy Data Archive — Barker et al. (2021), Planetary & Space Science 203, 105119",
        "doi": "https://doi.org/10.1016/j.pss.2020.105119",
        "access": "https://pgda.gsfc.nasa.gov/products/78",
        "resolution": "5 m (resampled to 30 m for comparison)",
    },
    "mars2020-meda": {
        "title": "Perseverance MEDA near-surface meteorology at Jezero crater",
        "provider": "Rodriguez-Manfredi et al. (2023), Nature Geoscience 16, 19–28",
        "doi": "https://doi.org/10.1038/s41561-022-01084-0",
        "use": "daily air-temperature variation of ~50–60 °C (mid-point 55 °C used)",
    },
    "nasa-lunar-environment": {
        "title": "Lunar Environment and Lunar Power Needs (NASA Technical Reports Server)",
        "provider": "NASA",
        "access": "https://ntrs.nasa.gov/citations/20205002224",
        "use": "candidate south-pole landing sites experience +22 °C to −220 °C (range 242 °C)",
    },
    "sentinel-2-l2a": {
        "title": "Sentinel-2 Level-2A surface reflectance, true-colour (TCI) image",
        "provider": "European Space Agency / Copernicus; COGs hosted on AWS (Element 84 Earth Search)",
        "access": "https://registry.opendata.aws/sentinel-2-l2a-cogs/",
        "resolution": "10 m",
        "use": "visual context for the 3D viewer only; not used in metrics",
    },
}


# ---- small cache so re-runs do not download everything again -------------------
def _cache_path(cache_dir, site, kind):
    """Cache file name includes the coordinates, so moving a site invalidates its cache."""
    return os.path.join(cache_dir, f"{site['id']}_{site['lat']:.4f}_{site['lon']:.4f}_{kind}.npz")


def cache_file(site, kind, cache_dir="data/cache"):
    """Public helper (used by the notebook) to find a site's cached DEM ('dem') or imagery ('rgb')."""
    return _cache_path(cache_dir, site, kind)


def _cached_dem(site, cache_dir):
    p = _cache_path(cache_dir, site, "dem")
    if os.path.exists(p):
        d = np.load(p)
        return d["z"], Affine(*d["transform"][:6])
    z, tr = load_dem(site["lat"], site["lon"])
    np.savez_compressed(p, z=z, transform=np.array(tr))
    return z, tr


def _cached_imagery(site, shape_hw, cache_dir):
    p = _cache_path(cache_dir, site, "rgb")
    if os.path.exists(p):
        d = np.load(p, allow_pickle=False)
        if tuple(d["rgb"].shape[1:]) == tuple(shape_hw):
            return d["rgb"], json.loads(str(d["meta"]))
    rgb, meta = fetch_true_color(bbox(site["lat"], site["lon"]), shape_hw)
    np.savez_compressed(p, rgb=rgb, meta=json.dumps(meta))
    return rgb, meta


def process_site(site, out_viewer, cache_dir, imagery=True, climate=True):
    print(f"▶ {site['name']}")
    raw, profile, errors, img_meta, viewer = {}, None, [], None, None
    z = tr = None
    try:
        z, tr = _cached_dem(site, cache_dir)
        metrics, profile = terrain_metrics(z, tr, site["lat"])
        raw.update(metrics)
    except Exception as ex:
        errors.append(f"DEM: {ex}")
    climate_src, climate_info = {}, {}
    if climate:
        try:
            cm, climate_src, climate_info = climate_metrics(site["lat"], site["lon"], raw.get("elevation_mean_m"))
            raw.update(cm)
            time.sleep(2)  # be gentle with the free APIs
        except Exception as ex:
            errors.append(f"Climate: {ex}")
    if z is not None:
        rgb = None
        if imagery:
            try:
                rgb, img_meta = _cached_imagery(site, z.shape, cache_dir)
            except Exception as ex:
                errors.append(f"Imagery: {ex}")
        try:
            fig = build_figure(site, z, tr, rgb, img_meta)
            fname = f"{site['id']}.html"
            write_site_page(fig, os.path.join(out_viewer, fname))
            viewer = f"viewer/{fname}"
        except Exception as ex:
            errors.append(f"3D viewer: {ex}")
    for e in errors:
        print("   ⚠", e)
    metrics = {k: {"value": round(v, DECIMALS), "source": climate_src.get(k, "nasa-power") if k in CLIMATE_KEYS else SOURCE_OF[k],
                   "illustrative": False}
               for k, v in raw.items()}
    sources = {m["source"] for m in metrics.values()}
    if img_meta:
        sources.add("sentinel-2-l2a")
    return {
        **{k: site[k] for k in ("id", "name", "country", "lat", "lon", "analog_of", "target")},
        "description": "",
        "metrics": metrics,
        "terrain_profile": profile,
        "imagery": img_meta,
        "climate_info": climate_info,
        "viewer_3d": viewer,
        "similarity": {"score": None, "explanation": "Pending: requires planetary target metrics"},
        "sources": sorted(sources),
        "errors": errors,
    }


def compute_targets(cache_dir):
    """Terrain + climate metrics for each planetary target (cached as JSON)."""
    from . import targets as targets_mod
    targets_mod.CACHE_DIR = cache_dir
    out = {}
    for tid, t in TARGETS.items():
        p = os.path.join(cache_dir, f"target_{tid}.json")
        if os.path.exists(p):
            with open(p, encoding="utf-8") as fh:
                out[tid] = json.load(fh)
            continue
        print(f"▶ target: {t['name']}")
        rec = {k: t[k] for k in ("id", "body", "name", "lat", "lon", "notes")}
        rec["sources"] = sorted({t["dem_source"], t["climate_source"]})
        try:
            metrics, profile, info = target_metrics(t)
            src_of = {k: (t["climate_source"] if k in t["climate"] else t["dem_source"]) for k in metrics}
            rec["metrics"] = {k: {"value": round(v, DECIMALS), "source": src_of[k], "illustrative": False}
                              for k, v in metrics.items()}
            rec["terrain_profile"] = profile
            rec.update(info)
            if t.get("diviner"):
                try:
                    dv = diviner_prp_at(info["center_lat"], info["center_lon"])
                    rec["metrics"].update({k: {"value": round(v, DECIMALS), "source": "diviner-prp",
                                               "illustrative": False} for k, v in dv.items() if k != "n_cells"})
                    rec["diviner_cells"] = dv["n_cells"]
                    rec["sources"] = sorted(set(rec["sources"]) | {"diviner-prp"})
                except Exception as ex:
                    print(f"   ⚠ Diviner: {ex}")
                    rec.setdefault("warnings", []).append(f"Diviner: {ex}")
            rec["errors"] = []
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(rec, fh)
        except Exception as ex:
            print(f"   ⚠ {ex}")
            rec["metrics"] = {k: {"value": v, "source": t["climate_source"], "illustrative": False}
                              for k, v in t["climate"].items()}
            rec["errors"] = [f"Target DEM: {ex}"]
        out[tid] = rec
    return out


def add_similarity(results, targets):
    for r in results:
        t = targets.get(r["target"])
        if not t:
            continue
        sm = {k: v["value"] for k, v in r["metrics"].items()}
        tm = {k: v["value"] for k, v in t["metrics"].items()}
        r["similarity"] = {"target": t["id"], **similarity(sm, tm, t["name"])}
    return results


def run(out_dir="data", site_ids=None, imagery=True, climate=True):
    out_viewer = os.path.join(out_dir, "viewer")
    cache_dir = os.path.join(out_dir, "cache")
    os.makedirs(out_viewer, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    sites = [s for s in SITES if not site_ids or s["id"] in site_ids]
    results = [process_site(s, out_viewer, cache_dir, imagery, climate) for s in sites]
    targets = compute_targets(cache_dir)
    add_similarity(results, targets)
    output = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "analysis_area_km": HALF_KM * 2,
        "sources": SOURCES,
        "known_limitations": [
            "The same method and sources are applied to all sites. Climate comes from a global gridded product "
            "(NASA POWER/MERRA-2, ≈50 km); very local extremes such as the hyperaridity of La Pampa de la Joya may be "
            "overestimated. No site-specific corrections are applied.",
            "The lunar target square (10 × 10 km around LOLA Site 04, Shackleton rim) includes part of the crater's inner "
            "wall (≈4 km of relief), so its mean slope is high; it represents the terrain surrounding a possible base, "
            "not only the flat rim.",
            "Temperatures are adjusted to the site elevation with a standard lapse rate (6.5 °C/km).",
            "Slope and roughness depend on DEM resolution; all bodies are compared at ≈30 m.",
            "Planetary temperature ranges are published reference values, not computed from rasters."],
        "similarity_method": {"weights": WEIGHTS,
                              "description": "Weighted average of partial scores (0-100). Slope, roughness and "
                                             "temperature range: ratio smaller/larger value. Aridity: exp(-P/200 mm)."},
        "targets": targets,
        "sites": results,
    }
    with open(os.path.join(out_dir, "sites.json"), "w", encoding="utf-8") as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
    write_index(results, os.path.join(out_viewer, "index.html"))
    write_globe_page(build_globe(results), os.path.join(out_viewer, "globe.html"))
    ok = sum(not r["errors"] for r in results)
    print(f"\nsites.json + viewers written to {os.path.abspath(out_dir)}  ({ok}/{len(results)} sites without warnings)")
    print(f"Open {os.path.abspath(os.path.join(out_viewer, 'index.html'))} in your browser.")
    return results


def main():
    ap = argparse.ArgumentParser(description="NOVA TERRA LABS data pipeline")
    ap.add_argument("--out", default="data", help="output folder (default: data)")
    ap.add_argument("--sites", help="comma-separated site ids (default: all)")
    ap.add_argument("--no-imagery", action="store_true", help="skip Sentinel-2 imagery")
    ap.add_argument("--no-climate", action="store_true", help="skip Open-Meteo climate")
    a = ap.parse_args()
    run(a.out, a.sites.split(",") if a.sites else None, not a.no_imagery, not a.no_climate)


if __name__ == "__main__":
    main()
