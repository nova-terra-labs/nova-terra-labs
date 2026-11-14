"""Earth climate metrics, 2015–2024.

Primary source: NASA POWER Daily API, no key needed.
- Temperature: MERRA-2 T2M_MAX / T2M_MIN (≈50 km grid), adjusted from the grid-cell elevation to the
  site's mean DEM elevation with a standard lapse rate of 6.5 °C/km (the daily range is unchanged).
- Precipitation: MERRA-2 corrected precipitation (PRECTOTCORR), same source for all sites.
  (GPM IMERG was tested and discarded: it strongly overestimated rainfall at arid, coastal and island sites.)
Fallback: Open-Meteo Historical API (ERA5 / ERA5-Land), used only if NASA POWER fails.
The source of each value is recorded in sites.json.
"""
import time

import pandas as pd
import requests

from .sites import CLIMATE_START, CLIMATE_END

POWER_API = "https://power.larc.nasa.gov/api/temporal/daily/point"
OPEN_METEO_API = "https://archive-api.open-meteo.com/v1/archive"


def _summarise(tmax, tmin, precip_daily, dates):
    d = pd.DataFrame({"tmax": tmax, "tmin": tmin, "p": precip_daily}, index=pd.to_datetime(dates))
    if d[["tmax", "tmin"]].isna().all().any():
        raise RuntimeError("no temperature values for this point")
    annual = d["p"].groupby(d.index.year).sum()
    return {
        "temp_max_mean_c": float(d.tmax.mean()),
        "temp_min_mean_c": float(d.tmin.mean()),
        "temp_range_c": float((d.tmax - d.tmin).mean()),
        "temp_abs_min_c": float(d.tmin.min()),
        "temp_abs_max_c": float(d.tmax.max()),
        "precip_annual_mm": float(annual.mean()),
    }


def _get(url, params, retries=5):
    for attempt in range(retries):
        r = requests.get(url, params=params, timeout=180)
        if r.status_code == 429 or r.status_code >= 500:
            wait = 15 * (attempt + 1)
            print(f"   HTTP {r.status_code} from {url.split('/')[2]} -> waiting {wait}s ({attempt + 1}/{retries})")
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
        return r.json()
    raise RuntimeError(f"{url.split('/')[2]} still unavailable after {retries} attempts")


LAPSE_RATE_C_PER_KM = 6.5


def _power(lat, lon, parameters, community, utc=False):
    params = {"parameters": parameters, "community": community, "latitude": lat, "longitude": lon,
              "start": CLIMATE_START.replace("-", ""), "end": CLIMATE_END.replace("-", ""), "format": "JSON"}
    if utc:
        params["time-standard"] = "UTC"
    js = _get(POWER_API, params)
    par = js["properties"]["parameter"]
    fill = js.get("header", {}).get("fill_value", -999)
    clean = {k: {d: (None if v in (fill, -999, -99) else v) for d, v in par[k].items()} for k in par}
    grid_elev = (js.get("geometry", {}).get("coordinates") or [None, None, None])[2]
    return clean, grid_elev


def nasa_power_metrics(lat, lon, site_elev_m=None):
    """Returns (metrics, sources_by_metric, info)."""
    t, grid_elev = _power(lat, lon, "T2M_MAX,T2M_MIN,PRECTOTCORR", "AG")
    dates = sorted(t["T2M_MAX"])
    adj = 0.0
    if site_elev_m is not None and grid_elev is not None:
        adj = -LAPSE_RATE_C_PER_KM * (site_elev_m - grid_elev) / 1000.0
    tmax = [None if t["T2M_MAX"][d] is None else t["T2M_MAX"][d] + adj for d in dates]
    tmin = [None if t["T2M_MIN"][d] is None else t["T2M_MIN"][d] + adj for d in dates]
    precip = [t["PRECTOTCORR"][d] for d in dates]
    m = _summarise(tmax, tmin, precip, dates)
    src = {k: "nasa-power" for k in m}
    info = {"climate_grid_elevation_m": grid_elev, "temperature_lapse_adjustment_c": round(adj, 2)}
    return m, src, info


def open_meteo_metrics(lat, lon):
    js = _get(OPEN_METEO_API, {
        "latitude": lat, "longitude": lon, "start_date": CLIMATE_START, "end_date": CLIMATE_END,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum", "timezone": "UTC"})
    d = js["daily"]
    return _summarise(d["temperature_2m_max"], d["temperature_2m_min"], d["precipitation_sum"], d["time"])


def climate_metrics(lat, lon, site_elev_m=None):
    """Returns (metrics, sources_by_metric, info). NASA POWER first, Open-Meteo only as a fallback."""
    try:
        return nasa_power_metrics(lat, lon, site_elev_m)
    except Exception as ex:
        print(f"   NASA POWER failed ({ex}); using Open-Meteo fallback")
        m = open_meteo_metrics(lat, lon)
        return m, {k: "open-meteo-era5" for k in m}, {"climate_fallback": str(ex)[:200]}
