# NOVA TERRA LABS — Backend data pipeline

Generates the scientific data used by the front-end (`sites.json`) and an interactive
3D terrain viewer for every candidate analog site. Everything runs locally with free,
open data — **no API keys or accounts are required**.

## Data sources

| Source | Used for | Access |
|---|---|---|
| Copernicus DEM GLO-30 (ESA, 30 m) — [doi:10.5270/ESA-c5d3d65](https://doi.org/10.5270/ESA-c5d3d65) | elevation, slope, roughness, terrain profile, 3D relief | public COGs on AWS |
| NASA POWER Daily API (MERRA-2, NASA GMAO) | temperature, daily range, annual precipitation (2015–2024) | free public API, no key (Open-Meteo/ERA5 used only as fallback) |
| USGS Mars 2020 CTX DTM (Jezero, 20 m) and NASA LOLA 5 m DEM (Shackleton rim) | slope and roughness of the planetary targets, same method as on Earth | public downloads |
| LRO Diviner Polar Resource Product (NASA PDS) | annual max / average temperature at the lunar target (context) | public download (~600 MB, cached) |
| Sentinel-2 L2A true colour (Copernicus/ESA) | satellite image draped on the 3D relief (visual only) | public COGs on AWS via Earth Search STAC |

## Setup

Requires Python 3.10+.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python -m app.pipeline                              # all sites
python -m app.pipeline --sites andahua,mauna-kea    # only some sites
python -m app.pipeline --no-imagery                 # faster: elevation colouring only
```

Outputs (in `backend/data/`):

| File | Content |
|---|---|
| `sites.json` | data contract for the front-end: metrics (2 decimals), source of each value, terrain profile, imagery scene, link to the 3D viewer |
| `viewer/index.html` | table of all sites with links to their 3D viewers — open it in a browser |
| `viewer/globe.html` | rotatable 3D globe with all sites; click a marker to open its terrain viewer |
| `viewer/<site-id>.html` | interactive 3D viewer (rotate, zoom, satellite/elevation, vertical exaggeration ×1–×10); works offline |
| `cache/` | downloaded DEM and imagery, so re-runs are fast (not committed to Git) |

## Third-party assets

- `app/assets/topojson/`: world map for the globe, from [sane-topojson](https://github.com/etpinard/sane-topojson) (MIT licence), bundled so the globe works offline.

## Tests

```bash
python -m pytest -q
```

## Sites

Defined in `app/sites.py`. Coordinates are approximate centre points of a 10 × 10 km
analysis square and must be validated before the final submission.

## Known limitations

- The lunar target square (10 × 10 km around the Shackleton rim, LOLA Site 04) includes part of the crater's inner wall, so its mean slope is high: it represents the terrain around a possible base, not only the flat rim.

- The same method and sources are applied to all sites. Climate comes from global gridded products, so very local extremes (e.g. the hyperaridity of La Pampa de la Joya) may be overestimated; no site-specific corrections are applied.

- Climate values come from a reanalysis grid (≈9–25 km): they describe the region, not the exact point.
- Slope and roughness depend on DEM resolution; comparisons with Moon/Mars data must use equivalent resolutions.
- Sentinel-2 coverage is limited at very high latitudes; when no clear scene is found the viewer falls back to elevation colouring and says so.
- Vertical exaggeration in the viewer is visual only; hover always shows true elevation.
