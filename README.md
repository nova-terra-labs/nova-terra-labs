# NovaTerra Labs · Earth Analogue Program

**Understanding Earth to prepare for exploration beyond it.**

Our answer to the NASA International Space Apps Challenge 2026 challenge *"Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars"*.

We measure terrain and climate at 15 places on Earth and at two planetary targets — the **Shackleton crater rim near the lunar south pole** (a candidate Artemis base region) and **Jezero crater on Mars** (Perseverance landing site) — and score how alike they are, with one method and open data only.

**Live app:** https://nova-terra-labs.github.io/nova-terra-labs/

## What the app shows

| Screen | Content |
|---|---|
| **Bridge** | Mission start screen; choose Earth, Moon or Mars |
| **Atlas** | 3D globe with the 15 analogue sites; filter by target (Moon / Mars) and environment; site insight with the real similarity score |
| **Field log** | Per site: 3D terrain (Copernicus DEM + Sentinel-2 true colour, vertical exaggeration ×1–×10), satellite close-up of the 10 × 10 km square, all metrics vs the planetary target, similarity breakdown, terrain profile, Google Earth / NASA Worldview links, sources |
| **Discover** | The same index on every 10 × 10 km land cell of three search zones (southern Peru, Atacama–Altiplano in Chile, Puna de Catamarca in Argentina): similarity map, top-10 cells, new finds, and terrain families from machine learning (k-means) |
| **Compare** | Rankings for Mars and Moon analogues, the two planetary targets (including LRO Diviner temperatures), method, weights, known limitations, all sources |

## Results (similarity score 0–100)

| Mars analogues (vs Jezero) | Score | Moon analogues (vs Shackleton rim) | Score |
|---|---|---|---|
| La Pampa de la Joya, Arequipa, Peru | 66.5 | Cerro Chao dacite dome, Atacama, Chile | 59.7 |
| Atacama Desert (Yungay), Chile | 56.7 | Monturaqui impact crater, Atacama, Chile | 41.0 |
| Salar de Pajonales, Chile | 55.8 | Timanfaya lava fields, Lanzarote, Spain | 37.7 |
| McMurdo Dry Valleys (Wright Valley), Antarctica | 39.4 | Meteor Crater (Barringer), Arizona, USA | 35.5 |
| Campo de Piedra Pómez, Catamarca, Argentina | 39.0 | Craters of the Moon, Idaho, USA | 32.3 |
| Haughton Crater, Canada | 38.3 | Mauna Kea, Hawaii, USA | 30.4 |
| Andahua Volcanic Field, Arequipa, Peru | 25.7 | Askja caldera, Icelandic Highlands, Iceland | 22.5 |
| Makgadikgadi Pans, Botswana | 16.6 | | |

**Do the results depend on our weights?** We re-ranked every site with all 375 weight sets in which each weight goes from 0.10 to 0.50 (steps of 0.05) and the four add up to 1. La Pampa de la Joya is #1 for Mars in 78 % of them and never below #2; Cerro Chao is #1 for the Moon in 89 % and never below #3. The leaders do not depend on our particular weights (Compare screen).

Data generated on 2026-11-14. See [docs/methodology.md](docs/methodology.md) for how the score is computed and its limitations.

## Discover: searching whole zones

The 15 sites were chosen by the team. **Discover** applies the same index to every 10 × 10 km land cell of three search zones (1,265 cells), so it can point to places nobody has proposed. A cell more than 50 km from all of our sites is marked as a *new find*.

| Search zone | Cells | Best Mars cell | Best Moon cell |
|---|---|---|---|
| Southern Peru (Arequipa, Moquegua, Tacna) | 395 | 72.5 — 10 km from La Pampa de la Joya | 54.7 — new find near the coast of Moquegua–Tacna |
| Atacama and Altiplano, Chile | 440 | **89.5 — new find**, 117 km from our nearest site | 64.6 — 11 km from Cerro Chao |
| Puna de Catamarca, Argentina | 430 | 62.1 — 16 km from Campo de Piedra Pómez | 52.7 — new find |

The search confirms our best sites (the top cells in Peru and for the Moon in Chile sit next to La Joya and Cerro Chao) and adds new leads, above all a hyper-arid plain in the Atacama whose slope (2.9°) is almost identical to Jezero's. A high score is a lead to check on imagery and in the field, not a confirmed analogue.

**Analyse any place on Earth (approximate).** In Discover, a user can click any point in the world: the app downloads NASA POWER climate and elevation for that 10 × 10 km square in the browser, scores it against Mars and the Moon, and lists the most similar places among our 15 sites and 1,265 cells (k-nearest neighbours). Because the Copernicus DEM cannot be read from a browser, terrain comes from the AWS Terrain Tiles elevation model, so **these live scores are approximate**. Run on our 15 sites, they differ from the official scores by 3.3 points on average (12 of 15 within ±3.5); the largest differences are Salar de Pajonales (+15, a salt flat) and McMurdo (coarser elevation data in Antarctica). The live result is a first screening; final scores come from the pipeline.

**Machine learning.** An unsupervised k-means model (k = 3, chosen by silhouette score) groups the 1,265 cells into terrain families without using our weights or targets. All 20 best Mars cells fall in the *low-relief, hyper-arid* family, together with La Pampa de la Joya, the Atacama Desert and Salar de Pajonales. Code: `backend/app/discover.py` and `tools/ml_terrain_families.py`.

## Reference analogues and new candidates

Eight sites are **reference analogues** — well-studied places already used by NASA and other agencies (Atacama, Haughton, McMurdo Dry Valleys, Askja, Mauna Kea, Meteor Crater, Craters of the Moon, Lanzarote). They benchmark the index. Seven are **new candidates** that have received much less attention (La Pampa de la Joya, Salar de Pajonales, Campo de Piedra Pómez, Andahua, Makgadikgadi, Cerro Chao, Monturaqui). A new candidate that scores as high as a reference site is a strong lead: **La Pampa de la Joya ranks first among all Mars analogues (66.5), above the Atacama Desert (56.7), and Cerro Chao ranks first among all Moon analogues (59.7), above Lanzarote (37.7).**

**New lunar candidates in a Mars-analogue region.** Cerro Chao and Monturaqui are in the Atacama, a region known mainly for Mars analogues. What makes them lunar candidates is the landform, not the region: Cerro Chao is a dacite lava dome studied as an analogue for the silicic domes of the Moon (Flahaut et al., 2021, doi:10.5194/egusphere-egu21-11780), and Monturaqui is a simple impact crater ≈370 m wide (Ugalde et al., 2007, doi:10.1111/j.1945-5100.2007.tb01015.x). At Monturaqui the 10 × 10 km square is mostly the surrounding ignimbrite plain, so its score describes the crater's setting more than the crater itself.

## Earth's limits as an analogue

| | Earth | Moon | Mars |
|---|---|---|---|
| Surface gravity | 9.81 m/s² (1 g) | 1.62 m/s² (0.17 g) | 3.71 m/s² (0.38 g) |
| Surface pressure | ≈1013 hPa | ≈0 (exosphere, near vacuum) | ≈6 hPa |
| Atmosphere | N₂ 78 %, O₂ 21 % | negligible (exosphere) | CO₂ ≈95 % |
| Surface radiation dose | ≈0.007 mSv/day | ≈1.37 mSv/day (Chang'e 4) | ≈0.67 mSv/day (Curiosity RAD) |
| Length of day | 24 h | ≈29.5 Earth days | ≈24 h 40 min |

No place on Earth reproduces these conditions. The index compares terrain and climate only; these differences apply equally to all sites. Sources: NASA NSSDCA Moon and Mars fact sheets; Zhang et al. (2020), *Science Advances*, doi:10.1126/sciadv.aaz1334; Hassler et al. (2014), *Science*, doi:10.1126/science.1244797.

## Next steps

- **Illumination:** LOLA illumination maps for the lunar south pole and sunlight duration for each Earth site.
- **Water and ice:** Diviner ice-stability areas compared with permafrost and ground-ice data on Earth.
- **Dust and wind:** wind and dust from NASA data compared with Perseverance MEDA measurements at Jezero.
- **Caves and lava tubes:** lava tubes at the volcanic sites compared with lunar pits seen by LRO.
- **Wider search:** extend Discover from three zones to whole countries and to the rest of the Americas.

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
