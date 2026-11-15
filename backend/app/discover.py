"""Discover: apply the same similarity index to every 10 x 10 km cell of a search zone.

The sites in sites.py were chosen by the team. This module searches a whole zone instead, so the
index can find places nobody proposed. Same data and method as the 15 sites:
- terrain: Copernicus DEM GLO-30 (slope, roughness), read once for the whole zone;
- climate: NASA POWER daily 2015-2024 (MERRA-2), fetched once per MERRA-2 grid cell
  (0.5 deg lat x 0.625 deg lon) and adjusted to each cell's mean elevation with 6.5 C/km;
- similarity: app.similarity against the Jezero and lunar-south-pole targets in data/sites.json.

Usage (from backend/, after the main pipeline has written data/sites.json):
    python -m app.discover --zone southern-peru
Output: data/discover.json (one entry per zone; other zones already in the file are kept).
"""
import argparse
import json
import math
import os
import time
from datetime import datetime, timezone

import numpy as np
import rasterio
from rasterio.merge import merge

from .climate import LAPSE_RATE_C_PER_KM, _power, _summarise
from .similarity import similarity
from .terrain import COP_URL, metrics_from_grid, tile_name

CELL_KM = 10.0
ZONES = {
    "southern-peru": {"name": "Southern Peru (Arequipa, Moquegua, Tacna)", "country": "Peru",
                      "south": -18.0, "north": -16.0, "west": -72.0, "east": -70.0},
    "atacama-chile": {"name": "Atacama and Altiplano, Chile", "country": "Chile",
                      "south": -24.0, "north": -22.0, "west": -69.0, "east": -67.0},
    "catamarca-argentina": {"name": "Puna de Catamarca, Argentina", "country": "Argentina",
                            "south": -27.0, "north": -25.0, "west": -68.0, "east": -66.0},
}
METRIC_KEYS = ("slope_mean_deg", "roughness_m", "temp_range_c", "precip_annual_mm")


def load_zone_dem(z):
    """Copernicus DEM for the whole zone (float32). Missing tiles (ocean) stay NaN."""
    srcs = []
    for la in range(math.floor(z["south"]), math.ceil(z["north"])):
        for lo in range(math.floor(z["west"]), math.ceil(z["east"])):
            try:
                srcs.append(rasterio.open(COP_URL.format(n=tile_name(la, lo))))
            except Exception:
                print(f"   no DEM tile {tile_name(la, lo)} (ocean)")
    try:
        arr, tr = merge(srcs, bounds=(z["west"], z["south"], z["east"], z["north"]), nodata=np.nan)
    finally:
        for s in srcs:
            s.close()
    dem = arr[0].astype("float32")
    dem[dem < -1000] = np.nan
    return dem, tr


def power_cell(lat, lon, cache_dir):
    """Raw NASA POWER series for the MERRA-2 cell containing (lat, lon), cached on disk."""
    glat, glon = round(lat * 2) / 2, round(lon / 0.625) * 0.625
    path = os.path.join(cache_dir, f"power_{glat:.3f}_{glon:.3f}.json")
    if os.path.exists(path):
        return json.load(open(path))
    t, grid_elev = _power(glat, glon, "T2M_MAX,T2M_MIN,PRECTOTCORR", "AG")
    out = {"t": t, "grid_elev": grid_elev}
    json.dump(out, open(path, "w"))
    time.sleep(1)
    return out


def climate_for(p, elev):
    t, ge = p["t"], p["grid_elev"]
    dates = sorted(t["T2M_MAX"])
    adj = -LAPSE_RATE_C_PER_KM * (elev - ge) / 1000.0 if ge is not None else 0.0
    tmax = [None if t["T2M_MAX"][d] is None else t["T2M_MAX"][d] + adj for d in dates]
    tmin = [None if t["T2M_MIN"][d] is None else t["T2M_MIN"][d] + adj for d in dates]
    return _summarise(tmax, tmin, [t["PRECTOTCORR"][d] for d in dates], dates)


def run(zone_id, data_dir="data", cache_dir="data/cache"):
    z = ZONES[zone_id]
    os.makedirs(cache_dir, exist_ok=True)
    sites = json.load(open(os.path.join(data_dir, "sites.json")))
    targets = {k: {m: v["value"] for m, v in t["metrics"].items()} for k, t in sites["targets"].items()}
    names = {k: t["name"] for k, t in sites["targets"].items()}
    print(f"Zone {zone_id}: reading Copernicus DEM ...")
    dem, tr = load_zone_dem(z)
    px_deg = abs(tr.a)
    dlat = CELL_KM / 110.574
    cells, skipped = [], 0
    lat = z["north"] - dlat / 2
    while lat - dlat / 2 >= z["south"] - 1e-9:
        dlon = CELL_KM / (111.320 * math.cos(math.radians(lat)))
        lon = z["west"] + dlon / 2
        while lon + dlon / 2 <= z["east"] + 1e-9:
            r0 = int((tr.f - (lat + dlat / 2)) / px_deg); r1 = int((tr.f - (lat - dlat / 2)) / px_deg)
            c0 = int(((lon - dlon / 2) - tr.c) / px_deg); c1 = int(((lon + dlon / 2) - tr.c) / px_deg)
            g = dem[max(r0, 0):r1, max(c0, 0):c1].astype("float64")
            land = np.isfinite(g) & (g > 0.5)          # Copernicus ocean = 0 m or missing tile
            if g.size == 0 or land.mean() < 0.5:
                skipped += 1
            else:
                g[~land] = np.nan
                dx = px_deg * 111320.0 * math.cos(math.radians(lat)); dy = px_deg * 110574.0
                tm, _ = metrics_from_grid(g, dx, dy)
                cm = climate_for(power_cell(lat, lon, cache_dir), tm["elevation_mean_m"])
                m = {**tm, **cm}
                sims = {k: similarity(m, targets[k], names[k]) for k in targets}
                cells.append({"lat": round(lat, 4), "lon": round(lon, 4),
                              "elev": round(tm["elevation_mean_m"]), "relief": round(tm["elevation_max_m"] - tm["elevation_min_m"]),
                              **{k: round(m[k], 2) for k in METRIC_KEYS},
                              "mars": sims["jezero"]["score"], "moon": sims["lunar-south-pole"]["score"],
                              "mars_c": sims["jezero"]["components"], "moon_c": sims["lunar-south-pole"]["components"]})
            lon += dlon
        lat -= dlat
        print(f"   row {lat:.2f}: {len(cells)} land cells so far")
    out_path = os.path.join(data_dir, "discover.json")
    out = json.load(open(out_path)) if os.path.exists(out_path) else {"zones": {}}
    out["cell_km"] = CELL_KM
    out["method"] = ("Same similarity index as the analogue sites, applied to every 10 x 10 km land cell of the zone. "
                     "Terrain: Copernicus DEM GLO-30. Climate: NASA POWER daily 2015-2024 (one MERRA-2 grid cell "
                     "shared by several 10 km cells), adjusted to each cell's mean elevation with 6.5 C/km.")
    out["zones"][zone_id] = {**z, "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "skipped_ocean_cells": skipped, "cells": cells}
    json.dump(out, open(out_path, "w"), separators=(",", ":"))
    best = lambda k: max(cells, key=lambda c: c[k])
    print(f"Done: {len(cells)} cells ({skipped} ocean). Best Mars {best('mars')['mars']} at "
          f"{best('mars')['lat']}, {best('mars')['lon']}; best Moon {best('moon')['moon']} at "
          f"{best('moon')['lat']}, {best('moon')['lon']} -> {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--zone", default="southern-peru", choices=sorted(ZONES))
    run(ap.parse_args().zone)
