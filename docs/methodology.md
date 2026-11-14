# Methodology

## Question
Which places on Earth have terrain and climate most similar to (a) the area around a permanent Moon base at the lunar south pole and (b) Jezero crater on Mars?

## Analysis unit
A **10 × 10 km square** centred on each site. The same square size is used on the Moon and on Mars. All elevation models are compared at **≈30 m** resolution (the Jezero CTX DTM, 20 m, and the LOLA south-pole DEM, 5 m, are resampled to 30 m).

## Metrics
| Metric | How it is computed | Source on Earth | Source on the target |
|---|---|---|---|
| Mean slope (°) | mean of the slope of every DEM cell in the square | Copernicus DEM GLO-30 | USGS CTX DTM (Mars) · LOLA 5 m (Moon) |
| Roughness (m) | standard deviation of elevation relative to its 5 × 5-cell moving average (≈150 m), i.e. local irregularity without the regional slope | Copernicus DEM GLO-30 | same as above |
| Daily temperature range (°C) | mean of daily (Tmax − Tmin), 2015–2024; temperatures adjusted to the site elevation with 6.5 °C/km | NASA POWER (MERRA-2) | Perseverance MEDA: 55 °C · NASA: +22 to −220 °C (242 °C) |
| Annual precipitation (mm) | mean annual total, 2015–2024 | NASA POWER (PRECTOTCORR) | 0 mm (no liquid precipitation) |

LRO Diviner temperatures at the lunar target (annual maximum -17.6 °C, annual average -162.3 °C) are reported as context and are **not** used in the score.

## Similarity score (0–100)
Weighted average of partial scores (0-100). Slope, roughness and temperature range: ratio smaller/larger value. Aridity: exp(-P/200 mm).

| Component | Weight |
|---|---|
| Mean slope | 30 % |
| Roughness | 30 % |
| Aridity (annual precipitation) | 30 % |
| Daily temperature range | 10 % |

Score = Σ weight × partial score. The weakest component is shown in the app as *"Where the analogy breaks"*.

## Planetary targets
| Target | Mean slope | Roughness | Temp. range | Precipitation |
|---|---|---|---|---|
| Jezero crater — Perseverance landing site | 2.88° | 0.96 m | 55 °C | 0 mm |
| Lunar south pole — Shackleton rim (LOLA Site 04) | 24.14° | 1.16 m | 242 °C | 0 mm |

## Known limitations
- The same method and sources are applied to all sites. Climate comes from a global gridded product (NASA POWER/MERRA-2, ≈50 km); very local extremes such as the hyperaridity of La Pampa de la Joya may be overestimated. No site-specific corrections are applied.
- The lunar target square (10 × 10 km around LOLA Site 04, Shackleton rim) includes part of the crater's inner wall (≈4 km of relief), so its mean slope is high; it represents the terrain surrounding a possible base, not only the flat rim.
- Temperatures are adjusted to the site elevation with a standard lapse rate (6.5 °C/km).
- Slope and roughness depend on DEM resolution; all bodies are compared at ≈30 m.
- Planetary temperature ranges are published reference values, not computed from rasters.

## Reproducibility
All inputs are open and need no API keys. Run `notebooks/NovaTerra_data_pipeline.ipynb` in Google Colab, or `python -m app.pipeline` in `backend/`.
