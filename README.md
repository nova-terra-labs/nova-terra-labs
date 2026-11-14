# NovaTerra Labs · Earth Analogue Program

**Understanding Earth to prepare for exploration beyond it.**

Our answer to the NASA International Space Apps Challenge 2026 challenge *"Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars"*.

We measure terrain and climate at 13 places on Earth and at two planetary targets — the **Shackleton crater rim near the lunar south pole** (a candidate Artemis base region) and **Jezero crater on Mars** (Perseverance landing site) — and score how alike they are, with one method and open data only.

**Live app:** https://rlostaunau-create.github.io/nova-terra-labs/

## What the app shows

| Screen | Content |
|---|---|
| **Bridge** | Mission start screen; choose Earth, Moon or Mars |
| **Atlas** | 3D globe with the 13 analogue sites; filter by target (Moon / Mars) and environment; site insight with the real similarity score |
| **Field log** | Per site: 3D terrain (Copernicus DEM + Sentinel-2 true colour, vertical exaggeration ×1–×10), satellite close-up of the 10 × 10 km square, all metrics vs the planetary target, similarity breakdown, terrain profile, Google Earth / NASA Worldview links, sources |
| **Compare** | Rankings for Mars and Moon analogues, the two planetary targets (including LRO Diviner temperatures), method, weights, known limitations, all sources |

## Results (similarity score 0–100)

| Mars analogues (vs Jezero) | Score | Moon analogues (vs Shackleton rim) | Score |
|---|---|---|---|
| La Pampa de la Joya, Arequipa, Peru | 66.5 | Timanfaya lava fields, Lanzarote, Spain | 37.7 |
| Atacama Desert (Yungay), Chile | 56.7 | Meteor Crater (Barringer), Arizona, USA | 35.5 |
| Salar de Pajonales, Chile | 55.8 | Craters of the Moon, Idaho, USA | 32.3 |
| McMurdo Dry Valleys (Wright Valley), Antarctica | 39.4 | Mauna Kea, Hawaii, USA | 30.4 |
| Campo de Piedra Pómez, Catamarca, Argentina | 39.0 | Askja caldera, Icelandic Highlands, Iceland | 22.5 |
| Haughton Crater, Canada | 38.3 | | |
| Andahua Volcanic Field, Arequipa, Peru | 25.7 | | |
| Makgadikgadi Pans, Botswana | 16.6 | | |

Data generated on 2026-11-14. See [docs/methodology.md](docs/methodology.md) for how the score is computed and its limitations.

## Repository structure

```
index.html, css/, js/      Front end (static, no build step)
assets/                    Images (cockpit, planets, Earth textures)
data/sites.json            Pipeline output: metrics, similarity, sources for every site
data/site_info.json        Short site texts and references shown in the app
data/terrain/*.json        Compact 3D terrain + Sentinel-2 colour per site
data/bundle.js             Same data as a script, so index.html also opens from disk
backend/                   Python data pipeline (terrain, climate, imagery, similarity)
notebooks/                 Google Colab notebook that runs the pipeline end to end
tools/                     Helpers to rebuild data/terrain and data/bundle.js
docs/                      Methodology and data sources
```

## Run the app

- **Online:** GitHub Pages (below).
- **On your computer:** open `index.html` in Chrome, Edge or Firefox. No installation needed.

## Publish with GitHub Pages

1. Repository → **Settings** → **Pages**.
2. *Source*: **Deploy from a branch**. *Branch*: **main**, folder **/ (root)** → **Save**.
3. After 1–2 minutes the app is live at https://rlostaunau-create.github.io/nova-terra-labs/.

## Regenerate the data

1. Open `notebooks/NovaTerra_data_pipeline.ipynb` in Google Colab and **Run all** (or run `python -m app.pipeline` in `backend/`, see [backend/README.md](backend/README.md)).
2. Copy the new `sites.json` to `data/` and the viewer HTML files to a folder, then:

```bash
python tools/compact_viewers.py <viewer-folder> data/terrain
python tools/make_bundle.py data
```

## Challenge resources used

| Resource (Space Apps list) | Use in this project |
|---|---|
| ✅ NASA Planetary Data System (PDS) | LRO Diviner Polar Resource Product, read directly from the PDS archive |
| ✅ NASA Lunar Reconnaissance Orbiter (LRO) | LOLA 5 m topography of the Shackleton rim (lunar target terrain) |
| ✅ NASA LRO Diviner Lunar Data | Annual maximum and average temperatures at the lunar target |
| ✅ NASA Worldview | Linked from every field log |
| ✅ ESA Copernicus | Copernicus DEM GLO-30 (terrain) and Sentinel-2 L2A (imagery) |
| ✅ NASA Earth science data | Climate from NASA POWER (MERRA-2, NASA GMAO), 2015–2024 |
| – CSA RADARSAT, JAXA G-Portal, ESA Open Science Catalog | Not used in this version |

## Data sources

Copernicus DEM GLO-30 (ESA) · NASA POWER (MERRA-2, NASA GMAO) · Sentinel-2 L2A (ESA/Copernicus) · USGS Mars 2020 CTX DTM (Jezero) · NASA LOLA high-resolution south-pole topography · LRO Diviner Polar Resource Product (NASA PDS) · Perseverance MEDA (published values) · NASA lunar environment report. Full list with DOIs in [docs/data-sources.md](docs/data-sources.md).

## Third-party software

[globe.gl](https://github.com/vasturiano/globe.gl) (MIT), [Leaflet](https://leafletjs.com) (BSD-2-Clause), [Plotly.js](https://plotly.com/javascript/) (MIT), loaded from jsDelivr with local copies in `vendor/` and `data/viewer/`. Earth textures from the three-globe examples (NASA Blue Marble). Basemap imagery © Esri, Maxar, Earthstar Geographics. Fonts: Orbitron, Space Grotesk, Inter, IBM Plex Mono (Google Fonts, OFL).

## Team

**NovaTerra Labs** — NASA International Space Apps Challenge 2026

- Fátima Herrera (team owner), Peru
- Romy Lostaunau, Peru

## License

[MIT](LICENSE)
