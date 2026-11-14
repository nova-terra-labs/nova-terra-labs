"""True-colour satellite imagery from Sentinel-2 L2A (Copernicus, public COGs on AWS, no key).

Scenes are found through the Element 84 Earth Search STAC API. For each site the
least cloudy / least snowy recent scene that fully covers the analysis square is
selected, and its 10 m true-colour ("visual") image is resampled onto the DEM grid
so it can be draped over the 3D terrain.
"""
from datetime import date, timedelta

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds as transform_from_bounds

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"


def _score(item):
    p = item.properties
    return (p.get("eo:cloud_cover", 100)
            + 0.5 * p.get("s2:snow_ice_percentage", 0)
            + 0.2 * p.get("s2:nodata_pixel_percentage", 0))


def find_scenes(bounds, years=3, max_cloud=20, max_items=100):
    """Candidate scenes ordered best first (those fully covering the square come first)."""
    from pystac_client import Client
    from shapely.geometry import box, shape

    aoi = box(*bounds)
    end = date.today()
    start = end - timedelta(days=365 * years)
    search = Client.open(STAC_URL).search(
        collections=[COLLECTION], intersects=aoi.__geo_interface__,
        datetime=f"{start.isoformat()}/{end.isoformat()}",
        query={"eo:cloud_cover": {"lt": max_cloud}}, max_items=max_items)
    items = list(search.items())
    full = sorted([i for i in items if shape(i.geometry).contains(aoi)], key=_score)
    partial = sorted([i for i in items if not shape(i.geometry).contains(aoi)], key=_score)
    return full + partial


def read_true_color(href, bounds, shape_hw):
    """Reads the image window covering `bounds` (lon/lat) resampled to shape (H, W)."""
    h, w_px = shape_hw
    dst_transform = transform_from_bounds(*bounds, w_px, h)
    with rasterio.open(href) as src, WarpedVRT(
            src, crs="EPSG:4326", transform=dst_transform, width=w_px, height=h,
            resampling=Resampling.average, src_nodata=0, nodata=0) as vrt:
        rgb = vrt.read([1, 2, 3])
    return rgb.astype("uint8")


def fetch_true_color(bounds, shape_hw, max_tries=5, max_nodata=0.05):
    """Returns (rgb uint8 array (3,H,W), metadata dict). Raises if no usable scene."""
    last_err = "no Sentinel-2 scenes found"
    for item in find_scenes(bounds)[:max_tries]:
        try:
            rgb = read_true_color(item.assets["visual"].href, bounds, shape_hw)
        except Exception as ex:
            last_err = f"{item.id}: {ex}"
            continue
        nodata = float(np.mean(rgb.sum(axis=0) == 0))
        if nodata > max_nodata:
            last_err = f"{item.id}: {nodata:.0%} of the square without data"
            continue
        p = item.properties
        return rgb, {
            "source": "sentinel-2-l2a",
            "scene_id": item.id,
            "date": str(p.get("datetime", ""))[:10],
            "cloud_cover_pct": round(float(p.get("eo:cloud_cover", 0)), 2),
        }
    raise RuntimeError(f"Sentinel-2 imagery unavailable ({last_err})")
