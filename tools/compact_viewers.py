"""Convert Colab Plotly viewer HTML files into compact terrain JSON for the web app."""
import json, sys, os, base64, glob
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
dec = json.JSONDecoder()
def parse(s):
    i = s.index('Plotly.newPlot(') + len('Plotly.newPlot(')
    j = s.index(',', i) + 1
    while s[j].isspace(): j += 1
    data, e = dec.raw_decode(s, j)
    k = s.index(',', e) + 1
    while s[k].isspace(): k += 1
    layout, _ = dec.raw_decode(s, k)
    return data, layout
def b64(a): return base64.b64encode(a.tobytes()).decode()
for f in sorted(glob.glob(os.path.join(src, '*.html'))):
    sid = os.path.basename(f)[:-5]
    data, layout = parse(open(f, encoding='utf-8').read())
    t = data[0]
    x, y, z = (np.array(t[k], float) for k in 'xyz')
    xs, ys = np.unique(np.round(x, 6)), np.unique(np.round(y, 6))
    nx, ny = len(xs), len(ys)
    assert nx * ny == len(x), (sid, nx, ny, len(x))
    # order vertices on the grid (row = y, col = x)
    ix = np.searchsorted(xs, np.round(x, 6)); iy = np.searchsorted(ys, np.round(y, 6))
    Z = np.full((ny, nx), np.nan); Z[iy, ix] = z
    cols = t['vertexcolor']
    def rgb(c):
        c = c.strip()
        if c.startswith('#'): return [int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)]
        return [int(float(v)) for v in c[c.index('(') + 1:c.index(')')].split(',')[:3]]
    C = np.zeros((ny, nx, 3), np.uint8); C[iy, ix] = np.array([rgb(c) for c in cols], np.uint8)
    zmin = float(np.nanmin(Z))
    zq = np.round((Z - zmin) * 10).astype(np.uint16)  # decimetres above minimum
    scene = layout.get('scene', {})
    out = {"id": sid, "nx": nx, "ny": ny, "x": [float(xs[0]), float(xs[-1])], "y": [float(ys[0]), float(ys[-1])],
           "zmin": zmin, "z_dm_u16": b64(zq), "rgb_u8": b64(C),
           "aspect_z": scene.get('aspectratio', {}).get('z'), "title": layout.get('title', {}).get('text') if isinstance(layout.get('title'), dict) else layout.get('title'),
           "updatemenus": layout.get('updatemenus')}
    json.dump(out, open(os.path.join(dst, sid + '.json'), 'w'), separators=(',', ':'))
    print(sid, nx, ny, os.path.getsize(os.path.join(dst, sid + '.json')) // 1024, 'KB')
