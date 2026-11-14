"""Interactive 3D terrain viewers (offline HTML, no server or API key needed).

Each site is rendered as a Plotly Mesh3d built from the real Copernicus DEM, with the
Sentinel-2 true-colour image draped on it. The page lets the user switch between
satellite and elevation colouring and change the vertical exaggeration.
"""
import html
import math
import os
import shutil

import numpy as np
import plotly.graph_objects as go

from .terrain import pixel_size_m

BG = "#050B18"        # deep navy / near-black
BTN = "#0891B2"       # button text: readable on both dark and highlighted buttons
PANEL = "#0B1428"
LIME = "#B6FF3B"      # primary accent
CYAN = "#22D3EE"      # secondary accent
TEXT = "#E6EDF5"
MUTED = "#8A97AB"

EXAGGERATIONS = (1, 2, 5, 10)


def _grid(z, transform, lat, max_px):
    step = max(1, int(math.ceil(max(z.shape) / max_px)))
    zs = z[::step, ::step]
    zs = np.where(np.isnan(zs), np.nanmean(zs), zs)
    dx, dy = pixel_size_m(transform, lat)
    h, w = zs.shape
    x = np.arange(w) * dx * step / 1000
    y = (h - 1 - np.arange(h)) * dy * step / 1000          # north at the top
    X, Y = np.meshgrid(x, y)
    idx = np.arange(h * w).reshape(h, w)
    a, b = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel()
    c, d = idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
    faces = (np.concatenate([a, b]), np.concatenate([b, d]), np.concatenate([c, c]))
    return step, zs, X.ravel(), Y.ravel(), faces


def build_figure(site, z, transform, rgb=None, imagery_meta=None, max_px=220, exaggeration=2):
    step, zs, X, Y, (i, j, k) = _grid(z, transform, site["lat"], max_px)
    res_m = round(max(pixel_size_m(transform, site["lat"])) * step)
    Z = zs.ravel()
    width_km = max(X.max(), Y.max())
    relief_km = (Z.max() - Z.min()) / 1000
    hover = "x %{x:.2f} km<br>y %{y:.2f} km<br>elevation %{z:.2f} m<extra></extra>"
    light = dict(ambient=0.55, diffuse=0.85, roughness=0.9, specular=0.05, fresnel=0.1)

    traces = []
    has_img = rgb is not None
    if has_img:
        r, g, b = (rgb[ch, ::step, ::step][: zs.shape[0], : zs.shape[1]].ravel() for ch in range(3))
        colors = [f"#{rr:02x}{gg:02x}{bb:02x}" for rr, gg, bb in zip(r, g, b)]
        traces.append(go.Mesh3d(x=X, y=Y, z=Z, i=i, j=j, k=k, vertexcolor=colors,
                                lighting=light, lightposition=dict(x=-5e4, y=5e4, z=1e5),
                                hovertemplate=hover, name="Satellite"))
    traces.append(go.Mesh3d(x=X, y=Y, z=Z, i=i, j=j, k=k, intensity=Z, colorscale="Earth",
                            colorbar=dict(title=dict(text="m", font=dict(color=TEXT)),
                                          tickfont=dict(color=TEXT), len=0.6),
                            lighting=light, lightposition=dict(x=-5e4, y=5e4, z=1e5),
                            hovertemplate=hover, name="Elevation", visible=not has_img))
    fig = go.Figure(traces)

    def zratio(ex):
        return max(0.03, relief_km * ex / width_km)

    menus = [dict(
        type="buttons", direction="right", x=0.0, y=1.0, xanchor="left", yanchor="bottom",
        bgcolor=PANEL, bordercolor=LIME, font=dict(color=BTN, size=12), showactive=True,
        buttons=[dict(label=f"×{ex}", method="relayout",
                      args=[{"scene.aspectratio.z": zratio(ex)}]) for ex in EXAGGERATIONS],
        active=EXAGGERATIONS.index(exaggeration))]
    if has_img:
        menus.append(dict(
            type="buttons", direction="right", x=1.0, y=1.0, xanchor="right", yanchor="bottom",
            bgcolor=PANEL, bordercolor=CYAN, font=dict(color=BTN, size=12), showactive=True,
            buttons=[dict(label="Satellite", method="restyle", args=[{"visible": [True, False]}]),
                     dict(label="Elevation", method="restyle", args=[{"visible": [False, True]}])]))

    if has_img:
        img_txt = (f"Imagery: Sentinel-2 L2A true colour, {imagery_meta.get('date', '')} "
                   f"(scene {imagery_meta.get('scene_id', '')}), Copernicus/ESA")
    else:
        img_txt = "Imagery: not available for this site (elevation colouring only)"
    src_txt = (f"Elevation: Copernicus DEM GLO-30 (ESA), shown at ≈{res_m} m grid · {img_txt}"
               " · Vertical exaggeration is visual only; hover shows true elevation.")

    axis = dict(color=MUTED, gridcolor="#1C2A44", backgroundcolor=BG, showbackground=True,
                zerolinecolor="#1C2A44")
    fig.update_layout(
        title=dict(text=f"<b>{html.escape(site['name'])}</b>  ·  {site['country']}  ·  "
                        f"analog of {site['analog_of']}  ·  {site['lat']:.3f}, {site['lon']:.3f}",
                   font=dict(color=TEXT, size=16), x=0.01, y=0.97),
        paper_bgcolor=BG, plot_bgcolor=BG, font=dict(color=TEXT),
        margin=dict(l=0, r=0, t=90, b=30), updatemenus=menus,
        annotations=[dict(text=src_txt, x=0, y=-0.02, xref="paper", yref="paper",
                          showarrow=False, font=dict(color=MUTED, size=10), xanchor="left")],
        scene=dict(xaxis=dict(title="W → E (km)", **axis), yaxis=dict(title="S → N (km)", **axis),
                   zaxis=dict(title="Elevation (m)", nticks=4, **axis), bgcolor=BG,
                   aspectmode="manual",
                   aspectratio=dict(x=X.max() / width_km, y=Y.max() / width_km, z=zratio(exaggeration)),
                   camera=dict(eye=dict(x=0.95, y=-0.95, z=0.6))))
    return fig


def write_site_page(fig, path):
    # 'directory' -> plotly.min.js is copied once next to the pages: works offline
    fig.write_html(path, include_plotlyjs="directory", full_html=True,
                   default_width="100%", default_height="100vh",
                   config={"displaylogo": False, "responsive": True})
    with open(path, encoding="utf-8") as fh:   # full-window dark page
        page = fh.read()
    page = page.replace("<head>", f"<head><title>NOVA TERRA LABS · {fig.layout.title.text.split('</b>')[0].replace('<b>', '')}</title>"
                        f"<style>html,body{{margin:0;height:100%;background:{BG};overflow:hidden}}</style>", 1)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)


def write_index(sites, path):
    rows = []
    for s in sites:
        m = {k: v["value"] for k, v in s["metrics"].items()}
        f = lambda k: "—" if k not in m else f"{m[k]:,.2f}"
        link = (f'<a href="{s["viewer_3d"].split("/")[-1]}">3D ↗</a>' if s.get("viewer_3d")
                else '<span class="muted">n/a</span>')
        warn = ' <span class="warn" title="{}">⚠</span>'.format(html.escape("; ".join(s["errors"]))) if s["errors"] else ""
        rows.append(
            f"<tr><td>{html.escape(s['name'])}{warn}<div class='muted'>{s['country']}</div></td>"
            f"<td><span class='tag {s['analog_of'].lower()}'>{s['analog_of']}</span></td>"
            f"<td>{f('elevation_mean_m')}</td><td>{f('slope_mean_deg')}</td><td>{f('roughness_m')}</td>"
            f"<td>{f('temp_range_c')}</td><td>{f('precip_annual_mm')}</td>"
            f"<td>{'—' if (s.get('similarity') or {}).get('score') is None else format(s['similarity']['score'], '.2f')}</td><td>{link}</td></tr>")
    page = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>NOVA TERRA LABS · Site viewers</title>
<style>
body{{margin:0;background:{BG};color:{TEXT};font-family:system-ui,Segoe UI,Roboto,sans-serif;
background-image:linear-gradient(#0E1A33 1px,transparent 1px),linear-gradient(90deg,#0E1A33 1px,transparent 1px);background-size:40px 40px}}
header{{padding:28px 32px 8px}} h1{{margin:0;letter-spacing:.18em;font-size:22px}} h1 span{{color:{LIME}}}
.sub{{color:{MUTED};margin-top:6px;font-size:13px}}
table{{margin:18px 32px 32px;border-collapse:collapse;background:rgba(11,20,40,.85);border:1px solid #1C2A44;width:calc(100% - 64px)}}
th,td{{padding:10px 14px;border-bottom:1px solid #1C2A44;text-align:left;font-size:14px}}
th{{color:{MUTED};font-weight:500;font-size:12px;letter-spacing:.08em;text-transform:uppercase}}
td:nth-child(n+3):not(:last-child){{font-variant-numeric:tabular-nums}}
a{{color:{LIME};text-decoration:none;font-weight:600}} a:hover{{text-decoration:underline}}
.muted{{color:{MUTED};font-size:12px}} .warn{{color:#FFB020;cursor:help}}
.tag{{font-size:11px;padding:2px 8px;border:1px solid;letter-spacing:.06em}}
.tag.mars{{color:#FF7A45;border-color:#FF7A45}} .tag.moon{{color:{CYAN};border-color:{CYAN}}}
footer{{color:{MUTED};font-size:11px;padding:0 32px 24px}}
</style></head><body>
<header><h1>NOVA <span>TERRA</span> LABS</h1>
<div class="sub">Understanding Earth to prepare for exploration beyond it · 3D site viewers (10 × 10 km) · <a href="globe.html">3D globe ↗</a></div></header>
<table><thead><tr><th>Site</th><th>Analog</th><th>Mean elev. (m)</th><th>Slope (°)</th>
<th>Roughness (m)</th><th>Temp. range (°C)</th><th>Precip. (mm/yr)</th><th>Similarity</th><th>View</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<footer>Sources: Copernicus DEM GLO-30 (ESA) · Sentinel-2 L2A (Copernicus/ESA) · Open-Meteo / ERA5 (ECMWF).
Full references in sites.json.</footer></body></html>"""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)


# ---------------------------------------------------------------------------
# 3D globe with all candidate sites
# ---------------------------------------------------------------------------
MARS = "#FF7A45"
LABEL_POS = {"pampa-la-joya": "middle right", "andahua": "middle left"}   # nearby sites


def _hover(s):
    m = {k: v["value"] for k, v in s.get("metrics", {}).items()}
    f = lambda k, u: f"{m[k]:,.2f} {u}" if k in m else "—"
    return (f"<b>{html.escape(s['name'])}</b><br>{s['country']} · analog of {s['analog_of']}"
            f"<br>{s['lat']:.3f}, {s['lon']:.3f}"
            f"<br>Mean elevation: {f('elevation_mean_m', 'm')}"
            f"<br>Mean slope: {f('slope_mean_deg', '°')}"
            f"<br>Roughness: {f('roughness_m', 'm')}"
            f"<br>Temp. range: {f('temp_range_c', '°C')}"
            f"<br>Precipitation: {f('precip_annual_mm', 'mm/yr')}"
            + (f"<br><b>Similarity: {s['similarity']['score']:.2f} / 100</b>"
               if (s.get('similarity') or {}).get('score') is not None else ""))


def build_globe(sites, start_lon=-60, start_lat=-10):
    """Rotatable orthographic globe (drag to spin) with one marker per site."""
    traces = []
    for body, color in (("Mars", MARS), ("Moon", CYAN)):
        group = [s for s in sites if s["analog_of"] == body]
        if not group:
            continue
        traces.append(go.Scattergeo(
            lat=[s["lat"] for s in group], lon=[s["lon"] for s in group],
            text=[s["name"].split(",")[0] for s in group],
            textposition=[LABEL_POS.get(s.get("id"), "top center") for s in group],
            textfont=dict(color=TEXT, size=11), mode="markers+text",
            marker=dict(size=11, color=color, line=dict(color=LIME, width=1.5), symbol="circle"),
            hovertext=[_hover(s) for s in group], hoverinfo="text",
            customdata=[s.get("viewer_3d") or "" for s in group],
            name=f"{body} analogs"))
    fig = go.Figure(traces)
    fig.update_geos(
        projection=dict(type="orthographic", rotation=dict(lon=start_lon, lat=start_lat)),
        showland=True, landcolor="#1B2B47", showocean=True, oceancolor="#07142B",
        showcoastlines=True, coastlinecolor="#3B5B7A", showcountries=True, countrycolor="#22324F",
        showlakes=True, lakecolor="#07142B", bgcolor=BG, resolution=50,
        lataxis=dict(showgrid=True, gridcolor="#12233F", dtick=15),
        lonaxis=dict(showgrid=True, gridcolor="#12233F", dtick=15))
    lons = [start_lon + d for d in range(0, 361, 6)]
    fig.frames = [go.Frame(layout=dict(geo=dict(projection=dict(rotation=dict(lon=lo, lat=start_lat)))),
                           name=str(i)) for i, lo in enumerate(lons)]
    fig.update_layout(
        title=dict(text="<b>NOVA TERRA LABS</b>  ·  Earth analog candidates  ·  drag to rotate, scroll to zoom",
                   font=dict(color=TEXT, size=16), x=0.01, y=0.97),
        paper_bgcolor=BG, font=dict(color=TEXT), height=720, margin=dict(l=0, r=0, t=60, b=10),
        legend=dict(x=0.01, y=0.92, bgcolor="rgba(11,20,40,.8)", bordercolor="#1C2A44", borderwidth=1),
        updatemenus=[dict(
            type="buttons", direction="right", x=0.99, y=0.97, xanchor="right", yanchor="top",
            bgcolor=PANEL, bordercolor=LIME, font=dict(color=BTN, size=12),
            buttons=[dict(label="▶ Rotate", method="animate",
                          args=[None, dict(frame=dict(duration=120, redraw=True), transition=dict(duration=0),
                                           fromcurrent=True, mode="immediate")]),
                     dict(label="❚❚ Stop", method="animate",
                          args=[[None], dict(frame=dict(duration=0, redraw=False), mode="immediate")])])])
    return fig


def write_globe_page(fig, path):
    """Offline page; clicking a marker opens that site's 3D terrain viewer."""
    click_js = """
var gd = document.getElementsByClassName('plotly-graph-div')[0];
gd.on('plotly_click', function(ev){
  var url = ev.points[0].customdata;
  if (url) { window.location.href = url.split('/').pop(); }
});"""
    # bundle the world map (sane-topojson, MIT) next to the page so it also works offline
    config = {"displaylogo": False, "responsive": True, "scrollZoom": True}
    topo_src = os.path.join(os.path.dirname(__file__), "assets", "topojson")
    if os.path.isdir(topo_src):        # otherwise Plotly loads the map from its CDN (needs internet)
        topo_dst = os.path.join(os.path.dirname(os.path.abspath(path)), "topojson")
        shutil.copytree(topo_src, topo_dst, dirs_exist_ok=True)
        config["topojsonURL"] = "topojson/"
    fig.write_html(path, include_plotlyjs="directory", full_html=True, post_script=click_js,
                   default_width="100%", default_height="100vh", config=config)
    with open(path, encoding="utf-8") as fh:
        page = fh.read()
    page = page.replace("<head>", "<head><title>NOVA TERRA LABS · Globe</title>"
                        f"<style>html,body{{margin:0;height:100%;background:{BG};overflow:hidden}}</style>", 1)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
