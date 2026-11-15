"""Candidate analog sites.

lat/lon are approximate centre points of the analysis square and must be
validated by the team before the final submission.
"""

HALF_KM = 5  # half the side of the analysis square (5 km -> 10 x 10 km)
CLIMATE_START, CLIMATE_END = "2015-01-01", "2024-12-31"

SITES = [
    # --- Mars analogs -------------------------------------------------------
    {"id": "pampa-la-joya", "name": "La Pampa de la Joya, Arequipa", "country": "Peru",
     "lat": -16.60, "lon": -71.95, "analog_of": "Mars", "target": "jezero"},
    {"id": "andahua", "name": "Andahua Volcanic Field, Arequipa", "country": "Peru",
     "lat": -15.42, "lon": -72.33, "analog_of": "Mars", "target": "jezero"},
    {"id": "atacama", "name": "Atacama Desert (Yungay)", "country": "Chile",
     "lat": -24.10, "lon": -70.00, "analog_of": "Mars", "target": "jezero"},
    {"id": "haughton", "name": "Haughton Crater", "country": "Canada",
     "lat": 75.38, "lon": -89.68, "analog_of": "Mars", "target": "jezero"},
    {"id": "makgadikgadi", "name": "Makgadikgadi Pans", "country": "Botswana",
     "lat": -20.75, "lon": 25.30, "analog_of": "Mars", "target": "jezero"},
    {"id": "mcmurdo", "name": "McMurdo Dry Valleys (Wright Valley)", "country": "Antarctica",
     "lat": -77.52, "lon": 161.60, "analog_of": "Mars", "target": "jezero"},
    # Added 14 Nov 2026 — lesser-known analogs with published support:
    # Campo de Piedra Pómez: Favaro et al. (2020) Icarus 346, 113765 (Mars-analogue aeolian landforms, yardangs).
    #   Centre validated on the satellite map (14 Nov 2026): square centred on the white pumice/yardang field.
    {"id": "campo-piedra-pomez", "name": "Campo de Piedra Pómez, Catamarca", "country": "Argentina",
     "lat": -26.63, "lon": -67.485, "analog_of": "Mars", "target": "jezero"},
    # Salar de Pajonales: Ca-sulfate salar studied as an analogue of early-Mars climate change
    #   (Frontiers in Astronomy and Space Sciences, 2022, doi:10.3389/fspas.2021.797591).
    {"id": "salar-pajonales", "name": "Salar de Pajonales", "country": "Chile",
     "lat": -25.14444, "lon": -68.82000, "analog_of": "Mars", "target": "jezero"},
    # --- Moon analogs -------------------------------------------------------
    # Askja caldera (Smithsonian GVP 373060), where Apollo crews trained in 1965 and 1967
    {"id": "iceland-highlands", "name": "Askja caldera, Icelandic Highlands", "country": "Iceland",
     "lat": 65.033, "lon": -16.783, "analog_of": "Moon", "target": "lunar-south-pole"},
    # New lunar candidates in the Atacama, a region known mainly for Mars analogs:
    # Cerro Chao dacite coulee (de Silva et al. 1994, doi:10.1029/94JB00652) and
    # Monturaqui impact crater (Ugalde et al. 2007, Meteoritics & Planetary Science 42)
    {"id": "cerro-chao", "name": "Cerro Chao dacite dome, Atacama", "country": "Chile",
     "lat": -22.117, "lon": -68.150, "analog_of": "Moon", "target": "lunar-south-pole"},
    {"id": "monturaqui", "name": "Monturaqui impact crater, Atacama", "country": "Chile",
     "lat": -23.9275, "lon": -68.2617, "analog_of": "Moon", "target": "lunar-south-pole"},
    {"id": "meteor-crater", "name": "Meteor Crater (Barringer), Arizona", "country": "USA",
     "lat": 35.027, "lon": -111.022, "analog_of": "Moon", "target": "lunar-south-pole"},
    {"id": "craters-of-the-moon", "name": "Craters of the Moon, Idaho", "country": "USA",
     "lat": 43.42, "lon": -113.55, "analog_of": "Moon", "target": "lunar-south-pole"},
    {"id": "lanzarote", "name": "Timanfaya lava fields, Lanzarote", "country": "Spain",
     "lat": 29.01, "lon": -13.75, "analog_of": "Moon", "target": "lunar-south-pole"},
    {"id": "mauna-kea", "name": "Mauna Kea, Hawaii", "country": "USA",
     "lat": 19.82, "lon": -155.47, "analog_of": "Moon", "target": "lunar-south-pole"},
]
