"""Machine learning on the Discover grid: unsupervised terrain families (k-means).

All land cells of all search zones are grouped by their four metrics (slope, roughness, annual
precipitation, daily temperature range), log-transformed and standardised, without the index weights.
k is chosen between 3 and 6 by the silhouette score. The 15 analogue sites are then assigned to the
nearest family. Writes the family of each cell (key "f") and a summary ("ml") into data/discover.json.

Usage: python tools/ml_terrain_families.py data
"""
import json, sys
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

d = sys.argv[1] if len(sys.argv) > 1 else "data"
K = ["slope_mean_deg", "roughness_m", "precip_annual_mm", "temp_range_c"]
disc = json.load(open(f"{d}/discover.json"))
sites = json.load(open(f"{d}/sites.json"))["sites"]
cells = [c for z in disc["zones"].values() for c in z["cells"]]
X = np.log1p(np.array([[c[k] for k in K] for c in cells]))
sc = StandardScaler().fit(X)
Z = sc.transform(X)
best = None
for k in range(3, 7):
    km = KMeans(k, n_init=50, random_state=0).fit(Z)
    s = silhouette_score(Z, km.labels_)
    print(f"k={k} silhouette={s:.3f}")
    if best is None or s > best[1]:
        best = (km, s)
km, sil = best


def label(m):
    sl, p = m["slope_mean_deg"], m["precip_annual_mm"]
    relief = "Low-relief" if sl < 6 else "Hilly" if sl < 12 else "Rugged"
    dry = "hyper-arid" if p < 50 else "arid" if p < 250 else "semi-arid"
    return f"{relief}, {dry}"


fams = []
for i in range(km.n_clusters):
    idx = np.where(km.labels_ == i)[0]
    med = {k: float(np.median([cells[j][k] for j in idx])) for k in K}
    fams.append({"n": int(len(idx)), "median": {k: round(v, 2) for k, v in med.items()}, "label": label(med),
                 "mars_mean": round(float(np.mean([cells[j]["mars"] for j in idx])), 1),
                 "moon_mean": round(float(np.mean([cells[j]["moon"] for j in idx])), 1)})
# order families by mean Mars score (family 1 = most Mars-like) and relabel
order = sorted(range(len(fams)), key=lambda i: -fams[i]["mars_mean"])
remap = {old: new for new, old in enumerate(order)}
fams = [fams[i] for i in order]
for f, i in zip(fams, range(len(fams))):
    f["id"] = i
for c, l in zip(cells, km.labels_):
    c["f"] = remap[int(l)]
site_fam = {s["id"]: remap[int(km.predict(sc.transform(np.log1p([[s["metrics"][k]["value"] for k in K]])))[0])] for s in sites}
top = lambda key: [c["f"] for c in sorted(cells, key=lambda c: -c[key])[:20]]
disc["ml"] = {"method": "k-means", "k": km.n_clusters, "silhouette": round(float(sil), 3), "features": K,
              "n_cells": len(cells), "families": fams, "sites": site_fam,
              "top20_mars_families": top("mars"), "top20_moon_families": top("moon")}
json.dump(disc, open(f"{d}/discover.json", "w"), separators=(",", ":"))
print(json.dumps({k: v for k, v in disc["ml"].items() if k != "sites"}, indent=1))
print(site_fam)
