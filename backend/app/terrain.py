"""Terrain metrics from the Copernicus DEM GLO-30 (public COGs on AWS, no key)."""
import math

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds
from scipy.ndimage import uniform_filter

from .sites import HALF_KM

COP_URL = "https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def tile_name(lat_floor, lon_floor):
    """1x1 degree tiles are named after their south-west corner."""
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00_{ew}{abs(lon_floor):03d}_00_DEM"


def bbox(lat, lon, half_km=HALF_KM):
    """Square of 2*half_km around the point -> (west, south, east, north) in degrees."""
    dlat = half_km / 110.574
    dlon = half_km / (111.320 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def load_dem(lat, lon):
    """Reads only the needed window of the DEM (COG files: the full tile is not downloaded)."""
    w, s, e, n = bbox(lat, lon)
    names = {tile_name(math.floor(la), math.floor(lo)) for la in (s, n) for lo in (w, e)}
    srcs = []
    for nm in sorted(names):
        try:
            srcs.append(rasterio.open(COP_URL.format(n=nm)))
        except Exception as ex:  # tile may not exist (ocean)
            print(f"   tile not available: {nm} ({ex.__class__.__name__})")
    if not srcs:
        raise RuntimeError("No DEM coverage for this site")
    try:
        if len(srcs) == 1:
            src = srcs[0]
            win = from_bounds(w, s, e, n, src.transform)
            z = src.read(1, window=win, boundless=True, fill_value=np.nan).astype("float64")
            tr = src.window_transform(win)
        else:
            z, tr = merge(srcs, bounds=(w, s, e, n), nodata=np.nan)
            z = z[0].astype("float64")
    finally:
        for s_ in srcs:
            s_.close()
    z[z < -1000] = np.nan
    return z, tr


def pixel_size_m(transform, lat):
    """(dx, dy) in metres for a lat/lon grid."""
    dy = abs(transform.e) * 110574.0
    dx = abs(transform.a) * 111320.0 * math.cos(math.radians(lat))
    return dx, dy


def metrics_from_grid(z, dx, dy):
    """Elevation stats, mean slope (deg), roughness (m) and a W-E profile through the centre.

    z: elevation grid (m); dx, dy: pixel size in metres. Used for Earth, Mars and Moon alike.
    Roughness = std. dev. of elevation relative to its 5x5-pixel moving average (~150 m at 30 m),
    i.e. local irregularity excluding the regional slope.
    """
    zf = np.where(np.isnan(z), np.nanmean(z), z)
    gy, gx = np.gradient(zf, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    resid = zf - uniform_filter(zf, size=5)
    mid = zf.shape[0] // 2
    prof = zf[mid, :]
    idx = np.linspace(0, len(prof) - 1, 100).round().astype(int)
    return {
        "elevation_mean_m": float(np.nanmean(z)),
        "elevation_min_m": float(np.nanmin(z)),
        "elevation_max_m": float(np.nanmax(z)),
        "slope_mean_deg": float(np.mean(slope)),
        "roughness_m": float(np.std(resid[2:-2, 2:-2])),
    }, {
        "distance_km": [round(float(i * dx / 1000), 3) for i in idx],
        "elevation_m": [round(float(prof[i]), 1) for i in idx],
    }


def terrain_metrics(z, transform, lat):
    """Same metrics for a lat/lon grid (Copernicus DEM)."""
    dx, dy = pixel_size_m(transform, lat)
    return metrics_from_grid(z, dx, dy)
