"""Similarity index between an Earth site and its planetary target (0–100).

Each variable gives a partial score between 0 and 1; the index is their weighted average.

- slope_mean_deg, roughness_m, temp_range_c: ratio of the smaller to the larger value
  (1 = identical, 0.5 = one is twice the other). Scale-free, so Earth, Mars and Moon can be compared.
- precip_annual_mm (aridity): Mars and Moon have no rain, so the score is exp(-P / 200):
  10 mm/yr -> 0.95, 100 mm/yr -> 0.61, 500 mm/yr -> 0.08.

WEIGHTS are a methodological choice of the team and can be changed here.
"""
import math

# Team decision (14 Nov 2026): terrain and aridity dominate; temperature counts less because no Earth
# site reaches Martian or lunar thermal extremes.
WEIGHTS = {"slope_mean_deg": 0.30, "roughness_m": 0.30, "precip_annual_mm": 0.30, "temp_range_c": 0.10}

LABELS = {"slope_mean_deg": "slope", "roughness_m": "roughness",
          "precip_annual_mm": "aridity", "temp_range_c": "daily temperature range"}

ARIDITY_SCALE_MM = 200.0


def _ratio(a, b):
    a, b = abs(a), abs(b)
    if a == 0 and b == 0:
        return 1.0
    return min(a, b) / max(a, b)


def partial_scores(site_metrics, target_metrics):
    out = {}
    for var in WEIGHTS:
        if var not in site_metrics or var not in target_metrics:
            continue
        s, t = site_metrics[var], target_metrics[var]
        if var == "precip_annual_mm":
            out[var] = math.exp(-max(s, 0.0) / ARIDITY_SCALE_MM)
        else:
            out[var] = _ratio(s, t)
    return out


def similarity(site_metrics, target_metrics, target_name):
    parts = partial_scores(site_metrics, target_metrics)
    if not parts:
        return {"score": None, "components": {}, "explanation": "Not enough data to compare."}
    wsum = sum(WEIGHTS[v] for v in parts)
    score = 100 * sum(WEIGHTS[v] * parts[v] for v in parts) / wsum
    best = max(parts, key=parts.get)
    worst = min(parts, key=parts.get)
    missing = [LABELS[v] for v in WEIGHTS if v not in parts]
    expl = (f"Compared with {target_name}: most similar in {LABELS[best]} "
            f"({parts[best] * 100:.0f}/100), least similar in {LABELS[worst]} ({parts[worst] * 100:.0f}/100).")
    if missing:
        expl += " Not compared (missing data): " + ", ".join(missing) + "."
    return {"score": round(score, 2),
            "components": {v: round(parts[v] * 100, 2) for v in parts},
            "weights": {v: WEIGHTS[v] for v in parts},
            "explanation": expl}
