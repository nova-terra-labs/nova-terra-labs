# Data sources

Every value in the app carries the id of its source (`source` field in `data/sites.json`).

## Copernicus DEM GLO-30 (Copernicus Global Digital Elevation Model, 30 m)
- **id:** `copernicus-dem`
- **Provider / reference:** European Space Agency / Airbus
- **DOI:** https://doi.org/10.5270/ESA-c5d3d65
- **Access:** https://registry.opendata.aws/copernicus-dem/
- **Resolution:** 30 m

## NASA POWER Daily API — T2M_MAX, T2M_MIN, PRECTOTCORR (2015–2024)
- **id:** `nasa-power`
- **Provider / reference:** NASA Langley Research Center POWER Project; meteorology from NASA GMAO MERRA-2
- **Access:** https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- **Period:** 2015-01-01 to 2024-12-31
- **Resolution:** ≈50 km (MERRA-2 grid); temperatures adjusted to site elevation with 6.5 °C/km

## LRO Diviner Polar Resource Product, south (DLRE_PRP_SOUTH.TAB)
- **id:** `diviner-prp`
- **Provider / reference:** NASA LRO Diviner — Paige et al. (2010), Science 330, 479–482
- **DOI:** https://doi.org/10.1126/science.1187726
- **Access:** https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/
- **Use in this project:** annual maximum surface temperature and annual average temperature (2 cm depth) at the lunar target; context only, not used in the similarity index

## Open-Meteo Historical Weather API (ERA5 / ERA5-Land reanalysis)
- **id:** `open-meteo-era5`
- **Provider / reference:** Open-Meteo; ECMWF Copernicus Climate Change Service
- **Reference:** Hersbach et al. (2020), The ERA5 global reanalysis, QJRMS. https://doi.org/10.1002/qj.3803
- **Access:** https://open-meteo.com/en/docs/historical-weather-api
- **Period:** 2015-01-01 to 2024-12-31
- **Resolution:** ≈9–25 km

## Mars 2020 Terrain Relative Navigation CTX DTM Mosaic (Jezero crater, 20 m)
- **id:** `usgs-ctx-jezero-dtm`
- **Provider / reference:** USGS Astrogeology Science Center — Fergason, Galuszka, Hare, Mayer & Redding (2020)
- **DOI:** https://doi.org/10.5066/P906QQT8
- **Access:** https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic
- **Resolution:** 20 m (resampled to 30 m for comparison)

## High-Resolution LOLA Topography for Lunar South Pole Sites (Site 04, Shackleton rim)
- **id:** `lola-south-pole-5mpp`
- **Provider / reference:** NASA GSFC Planetary Geodesy Data Archive — Barker et al. (2021), Planetary & Space Science 203, 105119
- **DOI:** https://doi.org/10.1016/j.pss.2020.105119
- **Access:** https://pgda.gsfc.nasa.gov/products/78
- **Resolution:** 5 m (resampled to 30 m for comparison)

## Perseverance MEDA near-surface meteorology at Jezero crater
- **id:** `mars2020-meda`
- **Provider / reference:** Rodriguez-Manfredi et al. (2023), Nature Geoscience 16, 19–28
- **DOI:** https://doi.org/10.1038/s41561-022-01084-0
- **Use in this project:** daily air-temperature variation of ~50–60 °C (mid-point 55 °C used)

## Lunar Environment and Lunar Power Needs (NASA Technical Reports Server)
- **id:** `nasa-lunar-environment`
- **Provider / reference:** NASA
- **Access:** https://ntrs.nasa.gov/citations/20205002224
- **Use in this project:** candidate south-pole landing sites experience +22 °C to −220 °C (range 242 °C)

## Sentinel-2 Level-2A surface reflectance, true-colour (TCI) image
- **id:** `sentinel-2-l2a`
- **Provider / reference:** European Space Agency / Copernicus; COGs hosted on AWS (Element 84 Earth Search)
- **Access:** https://registry.opendata.aws/sentinel-2-l2a-cogs/
- **Resolution:** 10 m
- **Use in this project:** visual context for the 3D viewer only; not used in metrics
