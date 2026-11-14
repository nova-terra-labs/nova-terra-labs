"""Planetary targets (Mars, Moon) measured with the same terrain method used on Earth.

Terrain: slope and roughness are computed from real orbital DEMs, resampled to ~30 m so that
they are comparable with the Copernicus DEM used for Earth sites.
Climate: values come from published measurements (cited in SOURCES) and are approximate.
"""
import math

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window

from .sites import HALF_KM
from .terrain import metrics_from_grid

TARGET_RES_M = 30.0   # common resolution for Earth / Mars / Moon terrain metrics
CACHE_DIR = None      # set by the pipeline: planetary DEMs are downloaded once and read locally


def _local_copy(url):
    """Downloads the whole file once (planetary DEMs are 10–40 MB) and returns a local path."""
    if not CACHE_DIR or not url.startswith("http"):
        return url
    import os
    import requests
    path = os.path.join(CACHE_DIR, url.rsplit("/", 1)[-1])
    if not os.path.exists(path):
        tmp = path + ".part"
        with requests.get(url, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(tmp, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
        os.replace(tmp, path)
    return path

TARGETS = {
    "jezero": {
        "id": "jezero", "body": "Mars",
        "name": "Jezero crater — Perseverance landing site",
        "lat": 18.4447, "lon": 77.4508,
        "dem_url": "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/"
                   "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
        "dem_source": "usgs-ctx-jezero-dtm",
        "climate": {"temp_range_c": 55.0, "precip_annual_mm": 0.0},
        "climate_source": "mars2020-meda",
        "notes": "Temperature range = mid-point of the 50–60 °C daily air-temperature variation reported "
                 "from Perseverance/MEDA. No liquid precipitation on Mars (0 mm).",
    },
    "lunar-south-pole": {
        "id": "lunar-south-pole", "body": "Moon",
        "name": "Lunar south pole — Shackleton rim (LOLA Site 04)",
        "lat": None, "lon": None,
        "dem_url": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif",
        "dem_source": "lola-south-pole-5mpp",
        "climate": {"temp_range_c": 242.0, "precip_annual_mm": 0.0},
        "climate_source": "nasa-lunar-environment",
        "diviner": True,
        "notes": "Temperature range = +22 °C to −220 °C reported by NASA for candidate south-pole landing "
                 "sites (surface temperature; the Moon has no air). No precipitation (0 mm).",
    },
}


def _read_resampled(src, window, res_m):
    """Reads a window and averages it down to ~res_m metres per pixel."""
    px = abs(src.transform.a)
    factor = max(1.0, res_m / px)
    out_h = max(10, int(round(window.height / factor)))
    out_w = max(10, int(round(window.width / factor)))
    z = src.read(1, window=window, out_shape=(out_h, out_w), resampling=Resampling.average,
                 masked=True).astype("float64").filled(np.nan)
    z[(z < -1e6) | (z > 1e6)] = np.nan
    dx = window.width * px / out_w
    dy = window.height * abs(src.transform.e) / out_h
    return z, dx, dy


def load_target_dem(target, half_km=HALF_KM, res_m=TARGET_RES_M):
    """Returns (z, dx, dy) for a 2*half_km square at the target, in metres."""
    with rasterio.open(_local_copy(target["dem_url"])) as src:
        half_px = int(round(half_km * 1000 / abs(src.transform.a)))
        if target["lat"] is not None:
            # projected planetary CRS (e.g. Mars equirectangular): convert lon/lat to x/y
            from pyproj import CRS, Transformer
            crs = CRS.from_user_input(src.crs)
            tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            x, y = tr.transform(target["lon"], target["lat"])
            row, col = src.index(x, y)
            center = (target["lat"], target["lon"])
        else:
            # site-centred DEM: use the centre of the raster
            row, col = src.height // 2, src.width // 2
            center = None
            try:
                from pyproj import CRS, Transformer
                crs = CRS.from_user_input(src.crs)
                tr = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
                lon, lat = tr.transform(*src.xy(row, col))
                center = (lat, lon)
            except Exception:
                pass
        win = Window(col - half_px, row - half_px, 2 * half_px, 2 * half_px).intersection(
            Window(0, 0, src.width, src.height))
        z, dx, dy = _read_resampled(src, win, res_m)
        return z, dx, dy, center


def target_metrics(target, loader=load_target_dem):
    out = loader(target)
    z, dx, dy = out[:3]
    center = out[3] if len(out) > 3 else None
    metrics, profile = metrics_from_grid(z, dx, dy)
    metrics.update(target["climate"])
    info = {"dem_pixel_m": round((dx + dy) / 2, 1)}
    if center:
        info["center_lat"], info["center_lon"] = round(center[0], 4), round(center[1], 4)
    return metrics, profile, info


DIVINER_PRP_SOUTH = ("https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/"
                     "data_derived_prp/dlre_prp_south.tab")
MOON_R_KM = 1737.4


def diviner_prp_at(lat, lon, radius_km=2.0, url=DIVINER_PRP_SOUTH, lines=None):
    """Mean Diviner annual max surface temperature and annual average temperature (°C)
    for mesh cells within radius_km of (lat, lon). Streams the ~600 MB table once.

    Fixed-width columns from the PDS4 label: tri_clon 127–141, tri_clat 144–158,
    temp_avg 178–185 (K, 2 cm depth), temp_max 188–195 (K, surface).
    """
    import requests
    lat0, lon0 = math.radians(lat), math.radians(lon)
    tmax, tavg = [], []
    if lines is None:
        resp = requests.get(url, stream=True, timeout=600)
        resp.raise_for_status()
        lines = (ln.decode("ascii", "ignore") for ln in resp.iter_lines())
    for ln in lines:
        try:
            clat = float(ln[143:158])
            if abs(clat - lat) > 0.5:   # quick reject: far from the target latitude
                continue
            clon = float(ln[126:141])
            la, lo = math.radians(clat), math.radians(clon)
            d = MOON_R_KM * math.acos(max(-1.0, min(1.0, math.sin(lat0) * math.sin(la)
                                                   + math.cos(lat0) * math.cos(la) * math.cos(lo - lon0))))
            if d <= radius_km:
                tavg.append(float(ln[177:185]))
                tmax.append(float(ln[187:195]))
        except ValueError:
            continue
    if not tmax:
        raise RuntimeError("no Diviner cells near the target")
    k = 273.15
    return {"diviner_temp_max_c": sum(tmax) / len(tmax) - k,
            "diviner_temp_avg_c": sum(tavg) / len(tavg) - k,
            "n_cells": len(tmax)}
