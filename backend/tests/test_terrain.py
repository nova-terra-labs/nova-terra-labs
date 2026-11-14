import math

import numpy as np
from affine import Affine

from app.terrain import bbox, terrain_metrics, tile_name
from app.viewer import build_figure

LAT = -16.6
RES = 1 / 3600
TR = Affine(RES, 0, -72, 0, -RES, -16.5)


def _plane(slope_ratio=0.1, ny=300, nx=320):
    dx = RES * 111320 * math.cos(math.radians(LAT))
    return 2000 + slope_ratio * dx * np.arange(nx)[None, :].repeat(ny, 0)


def test_tile_names():
    assert tile_name(-17, -72) == "Copernicus_DSM_COG_10_S17_00_W072_00_DEM"
    assert tile_name(75, -90) == "Copernicus_DSM_COG_10_N75_00_W090_00_DEM"


def test_bbox_is_10km():
    w, s, e, n = bbox(LAT, -71.95)
    assert abs((n - s) * 110.574 - 10) < 1e-6


def test_slope_of_10_percent_plane():
    m, profile = terrain_metrics(_plane(), TR, LAT)
    assert abs(m["slope_mean_deg"] - math.degrees(math.atan(0.1))) < 0.01
    assert m["roughness_m"] < 1e-6
    assert len(profile["elevation_m"]) == 100


def test_roughness_detects_noise():
    z = _plane() + np.random.default_rng(0).normal(0, 2, (300, 320))
    m, _ = terrain_metrics(z, TR, LAT)
    assert 1.5 < m["roughness_m"] < 2.5


def test_viewer_with_and_without_imagery():
    site = {"name": "Test", "country": "Peru", "analog_of": "Mars", "lat": LAT, "lon": -72}
    z = _plane()
    rgb = np.full((3,) + z.shape, 120, dtype="uint8")
    fig = build_figure(site, z, TR, rgb, {"date": "2025-01-01", "scene_id": "X"})
    assert len(fig.data) == 2 and fig.data[0].visible is not False
    fig2 = build_figure(site, z, TR, None, None)
    assert len(fig2.data) == 1


def test_globe_has_mars_and_moon_groups():
    from app.viewer import build_globe
    sites = [{"name": "A", "country": "Peru", "analog_of": "Mars", "lat": -16, "lon": -72, "metrics": {}},
             {"name": "B", "country": "USA", "analog_of": "Moon", "lat": 35, "lon": -111, "metrics": {}}]
    fig = build_globe(sites)
    assert [t.name for t in fig.data] == ["Mars analogs", "Moon analogs"]
    assert len(fig.frames) > 10


def test_similarity_identical_and_wet():
    from app.similarity import similarity
    t = {"slope_mean_deg": 5, "roughness_m": 2, "precip_annual_mm": 0, "temp_range_c": 55}
    same = similarity(dict(t), t, "T")
    assert same["score"] == 100
    wet = similarity({**t, "precip_annual_mm": 2000}, t, "T")
    assert wet["score"] < 80 and "aridity" in wet["explanation"]


def test_target_metrics_use_same_method():
    from app.targets import TARGETS, target_metrics
    z = _plane()
    m, profile, info = target_metrics(TARGETS["jezero"], loader=lambda t: (z, 30.0, 30.0))
    assert abs(m["slope_mean_deg"] - math.degrees(math.atan(0.1 * 30 / (RES * 111320 * math.cos(math.radians(LAT)))))) < 0.5
    assert m["precip_annual_mm"] == 0 and m["temp_range_c"] == 55


def test_diviner_fixed_width_parser():
    from app.targets import diviner_prp_at
    def row(clon, clat, tavg, tmax):
        line = [" "] * 210
        def put(start, length, val):
            txt = f"{val:>{length}}"
            line[start - 1:start - 1 + length] = list(txt)
        put(127, 15, f"{clon:.6f}"); put(144, 15, f"{clat:.6f}")
        put(178, 8, f"{tavg:.2f}"); put(188, 8, f"{tmax:.2f}")
        return "".join(line)
    lines = [row(200.0, -89.70, 100.0, 300.0), row(200.0, -89.71, 110.0, 310.0), row(20.0, -85.0, 50.0, 80.0)]
    out = diviner_prp_at(-89.70, 200.0, radius_km=2.0, lines=lines)
    assert out["n_cells"] == 2
    assert abs(out["diviner_temp_max_c"] - (305.0 - 273.15)) < 1e-6


def test_power_summary():
    from app.climate import _summarise
    m = _summarise([20, 22, None], [5, 6, 7], [0.0, 1.0, 0.0], ["2015-01-01", "2015-01-02", "2016-01-01"])
    assert abs(m["temp_range_c"] - 15.5) < 1e-9 and m["precip_annual_mm"] == 0.5


def test_lapse_rate_adjustment():
    from app import climate
    days = [f"2015010{i}" for i in range(1, 8)]
    def fake_power(lat, lon, parameters, community, utc=False):
        if "IMERG" in parameters:
            return {"IMERG_PRECTOT": {d: 0.0 for d in days}}, 600.0
        return {"T2M_MAX": {d: 20.0 for d in days}, "T2M_MIN": {d: 10.0 for d in days},
                "PRECTOTCORR": {d: 1.0 for d in days}}, 600.0
    climate._power = fake_power
    m, src, info = climate.nasa_power_metrics(19.8, -155.5, site_elev_m=3600.0)
    assert abs(info["temperature_lapse_adjustment_c"] + 19.5) < 1e-9
    assert abs(m["temp_max_mean_c"] - 0.5) < 1e-9 and abs(m["temp_range_c"] - 10.0) < 1e-9
    assert src["precip_annual_mm"] == "nasa-power" and abs(m["precip_annual_mm"] - 7.0) < 1e-9
