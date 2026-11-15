/* NovaTerra Labs — Earth Analogue Program front end.
   Static single-page app: hash routing, no build step.
   Data: data/sites.json (pipeline output) + data/site_info.json (site texts). */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
  const view = $("#view");
  const hasWebGL = (() => { try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); } catch (e) { return false; } })();
  const noGL = (what) => `<div class="frame3d" style="display:grid;place-items:center;text-align:center;padding:30px"><p class="muted">${what} needs WebGL, which is turned off in this browser.<br>Try Chrome or Edge with hardware acceleration enabled.</p></div>`;

  const ICONS = {
    bridge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    atlas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
    field: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>',
    discover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  };
  document.querySelectorAll("[data-route] .ico").forEach((el) => {
    const r = el.parentElement.dataset.route;
    if (ICONS[r]) el.innerHTML = ICONS[r];
  });

  const METRIC_LABELS = {
    slope_mean_deg: ["Mean slope", "°"],
    roughness_m: ["Roughness", "m"],
    precip_annual_mm: ["Aridity (annual precipitation)", "mm"],
    temp_range_c: ["Daily temperature range", "°C"],
  };
  const TIPS = {
    score: "Similarity score (0–100): how close this site's terrain and climate are to its planetary target. 100 would mean identical on all four scored metrics.",
    slope_mean_deg: "Mean steepness of the ground in the 10 × 10 km square. Drives rover traverses, landing safety and where a base can be built.",
    roughness_m: "How bumpy the surface is at ~150 m scale, after removing the regional slope. Affects wheels, landing hazards and walking EVAs.",
    precip_annual_mm: "Mean annual precipitation. Mars and the Moon have none, so drier sites score higher.",
    temp_range_c: "Average day–night temperature swing. Tests materials, batteries and thermal control.",
    elevation: "Mean height of the square. Context only; not part of the score.",
    relief: "Difference between the highest and lowest point in the square. Context only.",
    temps: "From NASA POWER daily data, 2015–2024. Context only.",
    breaks: "The scored metric where this site differs most from the planetary target.",
  };
  const info = (k) => `<span class="info" tabindex="0" role="note" aria-label="${esc(TIPS[k])}" data-tip="${esc(TIPS[k])}">i</span>`;
  const CAT = { reference: "Reference analogue", new: "New candidate" };
  const catTag = (s) => s.info.category ? `<span class="tag cat-${s.info.category}" title="${esc((state.info.categories || {})[s.info.category] || "")}">${CAT[s.info.category]}</span>` : "";
  TIPS.category = "Reference analogues are well-studied sites already used by space agencies; they benchmark the index. New candidates are less-studied sites that score as well as, or better than, the references.";
  const COMPONENT_ORDER = ["slope_mean_deg", "roughness_m", "precip_annual_mm", "temp_range_c"];
  const BODY_COLOR = { Mars: "#FF7A45", Moon: "#00D9FF" };

  const state = { data: null, info: null, body: "Both", envs: new Set(), selected: null, globe: null, map: null };

  // ---------- data ----------
  async function load() {
    // data/bundle.js (if present) lets the app open directly from disk (file://) without a web server
    const B = window.NT_BUNDLE;
    const [d, i] = B ? [B.sites, B.info] : await Promise.all([
      fetch("data/sites.json").then((r) => r.json()),
      fetch("data/site_info.json").then((r) => r.json()),
    ]);
    state.data = d;
    state.info = i;
    state.discover = B && B.discover ? B.discover : await fetch("data/discover.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    state.data.sites.forEach((s) => { s.info = i.sites[s.id] || { short: s.name, environment: [] }; });
    state.selected = ranked("Both")[0].id;
  }
  const sites = () => state.data.sites;
  const site = (id) => sites().find((s) => s.id === id);
  const target = (s) => state.data.targets[s.target];
  const ranked = (body) => sites().filter((s) => body === "Both" || s.analog_of === body).sort((a, b) => b.similarity.score - a.similarity.score);
  const rankOf = (s) => ranked(s.analog_of).indexOf(s) + 1;
  const src = (id) => state.data.sources[id] || { title: id };
  const mv = (obj, key) => (obj.metrics[key] ? obj.metrics[key].value : null);

  function weakest(s) {
    const c = s.similarity.components;
    const k = COMPONENT_ORDER.slice().sort((a, b) => c[a] - c[b])[0];
    return { key: k, label: METRIC_LABELS[k][0], score: c[k] };
  }
  function breaksText(s) {
    const w = weakest(s);
    const t = target(s);
    const unit = METRIC_LABELS[w.key][1];
    return `${w.label} is the weakest match (${fmt(w.score, 0)}/100): ${fmt(mv(s, w.key))} ${unit} here vs ${fmt(mv(t, w.key))} ${unit} at the ${t.body} target.`;
  }

  // ---------- chrome ----------
  const TITLES = {
    bridge: ["MISSION CONTROL", "BRIDGE / EARTH ANALOGUE PROGRAM"],
    atlas: ["ATLAS", "EXPEDITION 02 / EARTH ANALOGUE SITES"],
    field: ["FIELD LOG", "EXPEDITION 03 / SITE DATA"],
    compare: ["COMPARE", "EXPEDITION 04 / RANKINGS & METHOD"],
    discover: ["DISCOVER", "EXPEDITION 05 / SEARCH FOR NEW ANALOGUES"],
    about: ["THE PROJECT", "ABOUT / NASA SPACE APPS CHALLENGE 2026"],
  };
  function setChrome(route) {
    const [n, p] = TITLES[route] || TITLES.bridge;
    $("#topbar-name").textContent = n;
    $("#topbar-path").textContent = p;
    document.querySelectorAll("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
    const order = ["bridge", "atlas", "field", "compare", "discover"], cur = order.indexOf(route);
    document.querySelectorAll(".mission-path [data-step]").forEach((a) => {
      const i = order.indexOf(a.dataset.step);
      a.classList.toggle("active", i === cur); a.classList.toggle("done", cur > -1 && i < cur);
    });
    const fl = document.querySelector('.mission-path [data-step="field"]'); if (fl && state.selected) fl.href = `#field-${state.selected}`;
    document.title = route === "bridge" ? "NovaTerra Labs · Earth Analogue Program" : `${n[0] + n.slice(1).toLowerCase()} · NovaTerra Labs`;
  }
  function teardown() {
    if (state.globe) { try { state.globe._destructor && state.globe._destructor(); } catch (e) { /* ignore */ } state.globe = null; }
    if (state.map) { state.map.remove(); state.map = null; }
    window.removeEventListener("resize", onGlobeResize);
  }

  // "Next step" bar shown at the end of each screen
  const nextStep = (step, title, text, href, label, id) => `
    <div class="next-step panel">
      <div><div class="eyebrow">Next step · ${step}</div><b>${title}</b><span>${text}</span></div>
      <a class="btn btn-primary"${id ? ` id="${id}"` : ""} href="${href}">${label} <span>→</span></a>
    </div>`;

  // ---------- Bridge ----------
  function renderBridge() {
    view.innerHTML = `
    <section class="bridge" aria-hidden="true"></section>
    <section class="bridge-wrap">
      <div class="launcher panel">
        <div class="eyebrow">Bridge / Welcome aboard</div>
        <span class="logo-nova">NOVA TERRA</span><span class="logo-labs">LABS</span>
        <p class="tagline">Understanding Earth to prepare<br>for exploration beyond it.</p>
        <p class="lead">We identify places on Earth whose terrain and climate resemble the Moon's south pole and Mars' Jezero crater, using open NASA and ESA data, so crews, rovers and instruments can train where it matters.</p>
        <div class="actions">
          <a class="btn btn-primary" href="#atlas">Initiate exploration <span>→</span></a>
          <a class="btn btn-secondary" href="#about">Explore the project <span class="arrow">→</span></a>
        </div>
        <div class="mission"><span class="mono">Mission 01</span><span>Find Earth. Understand what comes next.</span></div>
      </div>
      <div class="hud-top"><span class="hud-pill">EARTH / SOL III</span><span class="hud-pill">ORBITAL VIEW</span></div>
      ${findings()}
      <div class="home-planet panel"><div class="mono">Home planet</div><div>Earth. Where it all begins.</div></div>
      <div>
        <div class="frontier-head"><span>CHOOSE YOUR NEXT FRONTIER</span><span class="lime">${sites().length} ANALOGUE SITES</span></div>
        <div class="frontiers" style="margin-top:12px">
          ${frontier("Earth", "Home planet", "Explore all analogue sites", "planet-earth.png", "#atlas", true)}
          ${frontier("Moon", "Natural satellite", `${ranked("Moon").length} sites vs the lunar south pole`, "planet-moon.png", "#atlas-moon")}
          ${frontier("Mars", "The red planet", `${ranked("Mars").length} sites vs Jezero crater`, "planet-mars.png", "#atlas-mars")}
        </div>
      </div>
      <div class="footer-line"><span>NASA INTERNATIONAL <span class="lime">SPACE APPS CHALLENGE 2026</span></span><span>EXPLORE · OBSERVE · COMPARE</span></div>
    </section>`;
  }
  // one line comparing the best new candidate with the best reference analogue (Mars)
  function headline() {
    return ["Mars", "Moon"].map((b) => {
      const r = ranked(b), n = r.find((s) => s.info.category === "new"), ref = r.find((s) => s.info.category === "reference");
      if (!n || !ref) return "";
      const above = n.similarity.score > ref.similarity.score;
      return `<p class="headline"><span class="tag cat-new">New candidate</span> ${esc(n.info.short)} (${fmt(n.similarity.score, 1)}) ${above ? "scores above" : "is close to"} ${esc(ref.info.short)} (${fmt(ref.similarity.score, 1)}), the top-scoring reference analogue for ${b === "Moon" ? "the Moon" : "Mars"}.</p>`;
    }).join("");
  }
  function findings() {
    const row = (b) => { const s = ranked(b)[0]; return `
      <a class="finding" href="#field-${s.id}">
        <span class="tag ${b.toLowerCase()}">#1 ${b} analogue</span>
        <b>${esc(s.info.short)}<small>${esc(s.country)}</small></b>
        <span class="score">${fmt(s.similarity.score, 1)}</span><span class="go">→</span>
      </a>`; };
    return `<div class="findings panel">
      <div class="eyebrow">Mission findings</div>
      <p>Best Earth analogues, scored 0–100 on terrain and climate ${info("score")}</p>
      ${row("Mars")}${row("Moon")}
      ${headline()}
      <a class="see-all" href="#compare">See all ${sites().length} sites ranked →</a>
    </div>`;
  }
  function frontier(name, kicker, desc, img, href, current) {
    return `<a class="frontier panel${current ? " current" : ""}" href="${href}">
      <img src="assets/${img}" alt="">
      <span><small>${esc(kicker)}</small><b>${esc(name)}</b><span class="d">${esc(desc)}</span></span>
      <span class="corner">${current ? "✓" : "→"}</span></a>`;
  }

  // ---------- Atlas ----------
  function visibleSites() {
    return ranked(state.body).filter((s) => (!state.envs.size || s.info.environment.some((e) => state.envs.has(e))) && (!state.cats || !state.cats.size || state.cats.has(s.info.category)));
  }
  function renderAtlas(param) {
    if (param && ["Moon", "Mars", "Both"].includes(param)) state.body = param;
    const envs = state.info.environments;
    state.cats = state.cats || new Set();
    view.innerHTML = `
    <section class="page atlas">
      <div class="atlas-left">
        <div class="page-title">
          <div class="eyebrow">Expedition 02 / Atlas</div>
          <h1>Find Earth's<br>training grounds.</h1>
          <p>Each site is a 10 × 10 km square compared with a planetary target using the same terrain and climate metrics.</p>
        </div>
        <div class="search panel">
          <h3>Shape your search</h3>
          <div class="label">TARGET</div>
          <div class="chips" id="body-chips">${["Moon", "Mars", "Both"].map((b) => `<button class="chip${state.body === b ? " on" : ""}" data-body="${b}">${b}</button>`).join("")}</div>
          <div class="label">SITE TYPE ${info("category")}</div>
          <div class="chips" id="cat-chips">${Object.entries(CAT).map(([k, n]) => `<button class="chip${state.cats.has(k) ? " on" : ""}" data-cat="${k}">${n}</button>`).join("")}</div>
          <div class="label">ENVIRONMENT</div>
          <div class="chips" id="env-chips">${envs.map((e) => `<button class="chip${state.envs.has(e) ? " on" : ""}" data-env="${e}">${e}</button>`).join("")}</div>
          <p class="hint" id="atlas-count"></p>
        </div>
      </div>
      <div class="globe-wrap">
        <div class="globe-crumb"><span class="lime">●</span> EARTH / ANALOGUE SITES</div>
        <div class="legend"><span><i style="background:${BODY_COLOR.Moon}"></i>MOON ANALOGUE</span><span><i style="background:${BODY_COLOR.Mars}"></i>MARS ANALOGUE</span></div>
        <div id="globe" role="img" aria-label="3D globe with analogue sites"></div>
        <div class="globe-caption">DRAG TO ROTATE · SCROLL TO ZOOM · CLICK A SITE</div>
      </div>
      <aside class="insight panel" id="insight" aria-live="polite"></aside>
      <div class="site-strip" id="site-strip"></div>
      <div class="atlas-next">${nextStep("03 Field log", "Open the site's field log", "3D terrain, satellite image, climate and the full similarity breakdown.", "#field", "Open field log", "atlas-next-btn")}</div>
    </section>`;
    $("#body-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-body]"); if (!b) return;
      state.body = b.dataset.body; history.replaceState(null, "", `#atlas${state.body === "Both" ? "" : "-" + state.body.toLowerCase()}`); refreshAtlas(true);
      document.querySelectorAll("#body-chips .chip").forEach((c) => c.classList.toggle("on", c.dataset.body === state.body));
    });
    $("#cat-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      const v = b.dataset.cat; state.cats.has(v) ? state.cats.delete(v) : state.cats.add(v);
      b.classList.toggle("on"); refreshAtlas(true);
    });
    $("#env-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-env]"); if (!b) return;
      const v = b.dataset.env; state.envs.has(v) ? state.envs.delete(v) : state.envs.add(v);
      b.classList.toggle("on"); refreshAtlas(true);
    });
    initGlobe();
    refreshAtlas(true);
  }
  function refreshAtlas(resetSel) {
    const list = visibleSites();
    if (resetSel && !list.some((s) => s.id === state.selected) && list.length) state.selected = list[0].id;
    $("#atlas-count").textContent = list.length ? `${list.length} site${list.length > 1 ? "s" : ""} shown, ranked by similarity score.` : "No site matches these filters.";
    $("#site-strip").innerHTML = list.map((s, i) => `
      <a class="site-card panel${s.id === state.selected ? " sel" : ""}" data-id="${s.id}">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <span><b>${esc(s.info.short)}</b><small>${esc(s.country)} · ${s.analog_of} · ${fmt(s.similarity.score, 1)}${s.info.category === "new" ? ' · <span class="lime">New</span>' : ""}</small></span>
        <span class="go">→</span></a>`).join("");
    $("#site-strip").onclick = (e) => { const c = e.target.closest("[data-id]"); if (c) selectSite(c.dataset.id, true); };
    renderInsight();
    if (state.globe) {
      state.globe.htmlElementsData(list);
    }
  }
  function selectSite(id, fly) {
    state.selected = id;
    document.querySelectorAll(".site-card").forEach((c) => c.classList.toggle("sel", c.dataset.id === id));
    document.querySelectorAll(".globe-label").forEach((c) => c.classList.toggle("sel", c.dataset.id === id));
    renderInsight();
    const s = site(id);
    if (fly && state.globe && s) state.globe.pointOfView({ lat: s.lat, lng: s.lon, altitude: 1.9 }, 900);
  }
  function renderInsight() {
    const box = $("#insight"); if (!box) return;
    const s = site(state.selected);
    if (!s || !visibleSites().includes(s)) { box.innerHTML = '<p class="muted">Select a site on the globe.</p>'; return; }
    const t = target(s);
    box.innerHTML = `
      <div class="eyebrow plain">Site insight</div>
      <div><h2>${esc(s.info.short)}</h2><div class="meta">${esc(s.country.toUpperCase())} · ${fmt(s.lat, 3)}°, ${fmt(s.lon, 3)}°</div></div>
      <div><span class="tag ${s.analog_of.toLowerCase()}">${s.analog_of} analogue</span> ${catTag(s)} ${info("category")} ${s.info.environment.map((e) => `<span class="tag" style="color:var(--muted)">${esc(e)}</span>`).join(" ")}</div>
      <div><div class="k">WHY IT MATTERS</div><p>${esc(s.info.why || s.name)}</p>${s.info.region_note ? `<p class="note" style="margin:6px 0 0">${esc(s.info.region_note)}</p>` : ""}</div>
      <div><div class="k">EXPLORATION USE</div><p>${esc(s.info.use || "—")}</p></div>
      <div><div class="k">WHERE THE ANALOGY BREAKS ${info("breaks")}</div><p>${esc(breaksText(s))}</p></div>
      <div class="score-box"><span><small>Similarity to ${esc(t.name.split(" — ")[0])} ${info("score")}</small><small>Rank #${rankOf(s)} of ${ranked(s.analog_of).length} ${s.analog_of} analogues</small></span><span class="score">${fmt(s.similarity.score, 1)}</span></div>
      <a class="btn btn-primary" href="#field-${s.id}">View site <span>→</span></a>`;
    const nb = $("#atlas-next-btn"); if (nb) nb.href = `#field-${s.id}`;
    const fl = document.querySelector('.mission-path [data-step="field"]'); if (fl) fl.href = `#field-${s.id}`;
  }
  function onGlobeResize() {
    const el = $("#globe"); if (el && state.globe) state.globe.width(el.clientWidth).height(el.clientHeight);
  }
  function initGlobe() {
    const el = $("#globe");
    if (!hasWebGL) { el.innerHTML = noGL("The 3D globe"); el.style.position = "static"; return; }
    if (typeof Globe !== "function") { el.innerHTML = '<p class="muted" style="padding:40px">3D globe unavailable in this browser.</p>'; return; }
    try {
      const g = Globe()(el)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(window.NT_TEXTURES ? NT_TEXTURES.blueMarble : "assets/earth-blue-marble.jpg")
        .bumpImageUrl(window.NT_TEXTURES ? NT_TEXTURES.topology : "assets/earth-topology.png")
        .atmosphereColor("#3aa8ff").atmosphereAltitude(0.18)
        .pointLat("lat").pointLng("lon").pointAltitude(0.012).pointRadius(0.55)
        .pointColor((s) => BODY_COLOR[s.analog_of])
        .onPointClick((s) => selectSite(s.id, true))
        .htmlLat("lat").htmlLng("lon").htmlAltitude(0.005)
        .htmlElement((s) => {
          const d = document.createElement("div");
          d.className = "globe-label" + (s.id === state.selected ? " sel" : "");
          d.dataset.id = s.id;
          d.innerHTML = `<i class="dot" style="background:${BODY_COLOR[s.analog_of]}"></i><span>${esc(s.info.short)}</span>`;
          d.onclick = () => selectSite(s.id, true);
          return d;
        });
      g.controls().autoRotate = false;
      g.controls().enableDamping = true;
      state.globe = g;
      onGlobeResize();
      window.addEventListener("resize", onGlobeResize);
      const s = site(state.selected) || sites()[0];
      g.pointOfView({ lat: s.lat, lng: s.lon, altitude: 2.3 }, 0);
    } catch (err) {
      el.innerHTML = `<p class="muted" style="padding:40px">3D globe unavailable (${esc(err.message)}).</p>`;
    }
  }

  // ---------- Field log ----------
  function renderField(id) {
    const s = site(id) || site(state.selected) || ranked("Both")[0];
    state.selected = s.id;
    if (!id) history.replaceState(null, "", `#field-${s.id}`);
    const t = target(s);
    const m = (k) => mv(s, k);
    const ci = s.climate_info || {};
    const comp = s.similarity.components;
    const w = s.similarity.weights;
    const gEarth = `https://earth.google.com/web/@${s.lat},${s.lon},${Math.round(m("elevation_mean_m") || 0)}a,9000d,35y,0h,45t,0r`;
    view.innerHTML = `
    <section class="page">
      <div class="field-head panel">
        <div>
          <div class="eyebrow">Expedition 03 / Field log</div>
          <h1 style="margin-top:8px">${esc(s.name)}</h1>
          <div class="coords">${esc(s.country)} · ${fmt(s.lat, 4)}°, ${fmt(s.lon, 4)}° · ${state.data.analysis_area_km} × ${state.data.analysis_area_km} km square</div>
        </div>
        <span class="tag ${s.analog_of.toLowerCase()}">${s.analog_of} analogue</span> ${catTag(s)}
        <div class="score-box" style="min-width:230px"><span><small>Similarity score ${info("score")}</small><small>Rank #${rankOf(s)} of ${ranked(s.analog_of).length}</small></span><span class="score">${fmt(s.similarity.score, 1)}</span></div>
        <select id="site-select" aria-label="Choose site">${["Mars", "Moon"].map((b) => `<optgroup label="${b} analogues">${ranked(b).map((x) => `<option value="${x.id}"${x.id === s.id ? " selected" : ""}>${esc(x.info.short)} · ${fmt(x.similarity.score, 1)}</option>`).join("")}</optgroup>`).join("")}</select>
      </div>

      <div class="grid-2">
        <div class="card panel">
          <h3>3D terrain <small>COPERNICUS DEM 30 M · SENTINEL-2 TRUE COLOUR${s.imagery && s.imagery.date ? " · " + esc(s.imagery.date) : ""}</small></h3>
          <div id="viewer-slot"></div>
        </div>
        <div class="card panel map-card">
          <h3>Satellite close-up <small>SENTINEL-2 TRUE COLOUR IN THE ANALYSIS SQUARE · ESRI CONTEXT</small></h3>
          <div id="map" class="map"></div>
          <div class="links">
            <a class="btn btn-secondary" href="${gEarth}" target="_blank" rel="noopener">Open in Google Earth <span class="arrow">↗</span></a>
            <a class="btn btn-secondary" href="https://worldview.earthdata.nasa.gov/?v=${s.lon - 0.4},${s.lat - 0.3},${s.lon + 0.4},${s.lat + 0.3}" target="_blank" rel="noopener">NASA Worldview <span class="arrow">↗</span></a>
          </div>
        </div>
      </div>

      <div class="card panel" id="twin-card">
        <h3>Earth vs ${esc(t.body)}, side by side <small>SAME 10 × 10 KM SQUARE · SAME VERTICAL SCALE · HEIGHT ABOVE LOWEST POINT</small></h3>
        <div class="viewer-tools"><div class="chips" id="tx">${[1, 2, 5].map((v) => `<button class="chip${v === 2 ? " on" : ""}" data-x="${v}">×${v}</button>`).join("")}</div><span class="note">Rotate one view and the other follows.</span></div>
        <div class="twin">
          <div><div class="twin-label"><span class="tag ${s.analog_of.toLowerCase()}">Earth</span> ${esc(s.info.short)} <span class="muted">· relief ${fmt(m("elevation_max_m") - m("elevation_min_m"), 0)} m</span></div><div id="twin-earth" class="frame3d twin-frame"></div></div>
          <div><div class="twin-label"><span class="tag ${t.body.toLowerCase()}">${esc(t.body)}</span> ${esc(t.name.split(" — ")[0])} <span class="muted">· relief ${fmt(mv(t, "elevation_max_m") - mv(t, "elevation_min_m"), 0)} m</span></div><div id="twin-target" class="frame3d twin-frame"></div></div>
        </div>
        <p class="note" style="margin-top:8px">Target terrain: ${t.body === "Mars" ? "USGS CTX DTM of Jezero crater (20 m)" : "NASA LRO LOLA 5 m DEM, Site 04 (Shackleton rim)"}, resampled to ≈30 m like the Earth DEM. Earth in Sentinel-2 true colour; the ${esc(t.body)} target shaded by height.</p>
      </div>

      <div class="grid-2">
        <div class="card panel">
          <h3>Site metrics <small>SITE · ${esc(t.body.toUpperCase())} TARGET</small></h3>
          <div class="metrics">
            ${metric("Mean elevation" + info("elevation"), m("elevation_mean_m"), "m", mv(t, "elevation_mean_m"), 0)}
            ${metric("Relief (max − min)" + info("relief"), m("elevation_max_m") - m("elevation_min_m"), "m", mv(t, "elevation_max_m") - mv(t, "elevation_min_m"), 0)}
            ${metric("Mean slope" + info("slope_mean_deg"), m("slope_mean_deg"), "°", mv(t, "slope_mean_deg"))}
            ${metric("Roughness" + info("roughness_m"), m("roughness_m"), "m", mv(t, "roughness_m"))}
            ${metric("Daily temperature range" + info("temp_range_c"), m("temp_range_c"), "°C", mv(t, "temp_range_c"))}
            ${metric("Annual precipitation" + info("precip_annual_mm"), m("precip_annual_mm"), "mm", mv(t, "precip_annual_mm"))}
            ${metric("Mean daily max / min" + info("temps"), null, "", null, 2, `${fmt(m("temp_max_mean_c"))} / ${fmt(m("temp_min_mean_c"))} °C`)}
            ${metric("Absolute min / max" + info("temps"), null, "", null, 2, `${fmt(m("temp_abs_min_c"))} / ${fmt(m("temp_abs_max_c"))} °C`)}
          </div>
          <p class="note" style="margin-top:12px">Climate: NASA POWER (MERRA-2) daily, 2015–2024. Grid cell elevation ${fmt(ci.climate_grid_elevation_m, 0)} m; temperatures adjusted ${ci.temperature_lapse_adjustment_c >= 0 ? "+" : ""}${fmt(ci.temperature_lapse_adjustment_c)} °C to the site elevation (6.5 °C/km).</p>
        </div>
        <div class="card panel">
          <h3>Similarity breakdown <small>VS ${esc(t.name.toUpperCase())}</small></h3>
          <div id="radar" class="radar" role="img" aria-label="Radar chart of the four partial scores"></div>
          <div class="bars">
            ${COMPONENT_ORDER.map((k) => `<div class="bar-row"><span>${METRIC_LABELS[k][0]} <span class="muted">×${w[k]}</span> ${info(k)}</span><div class="bar"><div style="width:${Math.max(0, Math.min(100, comp[k]))}%"></div></div><span class="v">${fmt(comp[k], 1)}</span></div>`).join("")}
          </div>
          <p class="note" style="margin-top:14px">${esc(s.similarity.explanation)}</p>
          <div style="margin-top:14px"><div class="eyebrow plain">Why it matters</div><p style="margin:6px 0 0">${esc(s.info.why || "—")}</p>${s.info.region_note ? `<p class="note" style="margin:6px 0 0">${esc(s.info.region_note)}</p>` : ""}</div>
          <div style="margin-top:12px"><div class="eyebrow plain">Exploration use</div><p style="margin:6px 0 0">${esc(s.info.use || "—")}</p></div>
          <div style="margin-top:12px"><div class="eyebrow plain">Where the analogy breaks ${info("breaks")}</div><p style="margin:6px 0 0">${esc(breaksText(s))}</p></div>
          ${s.info.reference ? `<p class="note" style="margin-top:12px">Reference: ${s.info.url ? `<a class="cyan" href="${esc(s.info.url)}" target="_blank" rel="noopener">${esc(s.info.reference)}</a>` : esc(s.info.reference)}</p>` : ""}
        </div>
      </div>

      <div class="card panel">
        <h3>Terrain profile <small>WEST → EAST THROUGH THE SQUARE CENTRE · SITE VS TARGET (RELATIVE ELEVATION)</small></h3>
        <div id="profile" class="plot"></div>
      </div>

      <div class="card panel">
        <h3>Data sources</h3>
        <ul class="src-list">${s.sources.concat(t.sources).filter((v, i, a) => a.indexOf(v) === i).map(sourceItem).join("")}</ul>
        ${s.errors && s.errors.length ? `<p class="note">Pipeline notes: ${s.errors.map(esc).join("; ")}</p>` : ""}
      </div>
      ${nextStep("04 Compare", "See how every site ranks", "Rankings for Mars and Moon analogues, the planetary targets, method and limitations.", "#compare", "Compare all sites")}
      <div class="footer-line"><span>NASA INTERNATIONAL <span class="lime">SPACE APPS CHALLENGE 2026</span></span><span>DATA GENERATED ${esc((state.data.generated_utc || "").slice(0, 10))}</span></div>
    </section>`;
    $("#site-select").onchange = (e) => { location.hash = `#field-${e.target.value}`; };
    mountViewer(s);
    mountMap(s);
    mountProfile(s, t);
    mountRadar(s);
    mountTwin(s, t);
  }
  function metric(label, v, unit, tv, d = 2, text) {
    return `<div class="metric"><small>${label}</small><b>${text ? esc(text) : `${fmt(v, d)} ${unit}`}</b>${tv !== null && tv !== undefined && !Number.isNaN(tv) ? `<i>target ${fmt(tv, d)} ${unit}</i>` : ""}</div>`;
  }
  function sourceItem(id) {
    const s = src(id);
    const link = s.doi || s.access;
    return `<li><b>${esc(s.title)}</b>${s.provider ? ` — ${esc(s.provider)}` : ""}${s.resolution ? `. Resolution ${esc(s.resolution)}` : ""}${link ? `. <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>` : ""}</li>`;
  }
  // 3D terrain: compact grid exported from the Colab viewers (data/terrain/<id>.json)
  const b64 = (str, Type) => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Type(u.buffer); };
  const terrainCache = {};
  function loadTerrain(id) {
    if (!terrainCache[id] && window.NT_BUNDLE && window.NT_BUNDLE.terrain[id]) terrainCache[id] = Promise.resolve(window.NT_BUNDLE.terrain[id]);
    if (!terrainCache[id]) terrainCache[id] = fetch(`data/terrain/${id}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    return terrainCache[id];
  }
  // Sentinel-2 true-colour of the analysis square as a PNG data URL (north up)
  async function sentinelImage(id) {
    const t = await loadTerrain(id);
    const rgb = b64(t.rgb_u8, Uint8Array), cv = document.createElement("canvas");
    cv.width = t.nx; cv.height = t.ny;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(t.nx, t.ny);
    for (let r = 0; r < t.ny; r++) for (let c = 0; c < t.nx; c++) {
      const src = (r * t.nx + c) * 3, dst = ((t.ny - 1 - r) * t.nx + c) * 4;
      img.data[dst] = rgb[src]; img.data[dst + 1] = rgb[src + 1]; img.data[dst + 2] = rgb[src + 2]; img.data[dst + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL("image/png");
  }
  async function mountViewer(s) {
    const slot = $("#viewer-slot");
    let t;
    try { t = await loadTerrain(s.id); }
    catch (e) { if (slot.isConnected) slot.innerHTML = '<div class="frame3d" style="display:grid;place-items:center"><p class="muted">3D terrain not available for this site.</p></div>'; return; }
    if (!slot.isConnected || typeof Plotly === "undefined") return;
    if (!hasWebGL) { slot.innerHTML = noGL("The 3D terrain view"); return; }
    const { nx, ny } = t;
    const zq = b64(t.z_dm_u16, Uint16Array), rgb = b64(t.rgb_u8, Uint8Array);
    const N = nx * ny, X = new Array(N), Y = new Array(N), Z = new Array(N), VC = new Array(N);
    const dx = (t.x[1] - t.x[0]) / (nx - 1), dy = (t.y[1] - t.y[0]) / (ny - 1);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const n = r * nx + c;
      X[n] = t.x[0] + c * dx; Y[n] = t.y[0] + r * dy; Z[n] = t.zmin + zq[n] / 10;
      VC[n] = `rgb(${rgb[n * 3]},${rgb[n * 3 + 1]},${rgb[n * 3 + 2]})`;
    }
    const I = [], J = [], K = [];
    for (let r = 0; r < ny - 1; r++) for (let c = 0; c < nx - 1; c++) {
      const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
      I.push(a, b); J.push(b, e); K.push(d, d);
    }
    const light = { ambient: 0.55, diffuse: 0.85, fresnel: 0.1, roughness: 0.9, specular: 0.05 };
    const lp = { x: -5e4, y: 5e4, z: 1e5 };
    const hov = "x %{x:.2f} km<br>y %{y:.2f} km<br>elevation %{z:.0f} m<extra></extra>";
    const base = (t.aspect_z || 0.1) / 2;
    const ar = { x: 1, y: (t.y[1] - t.y[0]) / (t.x[1] - t.x[0]) };
    slot.innerHTML = `<div class="viewer-tools">
        <div class="chips" id="vx">${[1, 2, 5, 10].map((v) => `<button class="chip${v === 2 ? " on" : ""}" data-x="${v}">×${v}</button>`).join("")}</div>
        <div class="chips" id="vm"><button class="chip on" data-m="0">Satellite</button><button class="chip" data-m="1">Elevation</button></div>
      </div><div id="terrain3d" class="frame3d"></div>
      <p class="note" style="margin-top:8px">Vertical exaggeration ×1 / ×2 / ×5 / ×10. Drag to rotate, scroll to zoom.</p>`;
    Plotly.newPlot("terrain3d", [
      { type: "mesh3d", x: X, y: Y, z: Z, i: I, j: J, k: K, vertexcolor: VC, lighting: light, lightposition: lp, hovertemplate: hov, name: "Satellite" },
      { type: "mesh3d", x: X, y: Y, z: Z, i: I, j: J, k: K, intensity: Z, colorscale: "Earth", visible: false, lighting: light, lightposition: lp, hovertemplate: hov, name: "Elevation",
        colorbar: { len: 0.6, title: { text: "m" }, tickfont: { color: "#EAF0F5" } } },
    ], {
      paper_bgcolor: "#050B14", margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, font: { color: "#EAF0F5", family: "Inter" },
      scene: {
        aspectmode: "manual", aspectratio: { x: ar.x, y: ar.y, z: base * 2 },
        xaxis: { title: { text: "km" }, gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        yaxis: { title: { text: "km" }, gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        zaxis: { title: { text: "m" }, gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        camera: { eye: { x: 0.95, y: -0.95, z: 0.62 } },
      },
    }, { responsive: true, displaylogo: false });
    $("#vx").onclick = (e) => { const b = e.target.closest("[data-x]"); if (!b) return;
      document.querySelectorAll("#vx .chip").forEach((c) => c.classList.toggle("on", c === b));
      Plotly.relayout("terrain3d", { "scene.aspectratio.z": base * Number(b.dataset.x) }); };
    $("#vm").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return;
      document.querySelectorAll("#vm .chip").forEach((c) => c.classList.toggle("on", c === b));
      Plotly.restyle("terrain3d", { visible: b.dataset.m === "0" ? [true, false] : [false, true] }); };
  }
  // Radar of the four partial scores (100 = identical to the target); compared with the #1 site for the same target
  function mountRadar(s) {
    if (typeof Plotly === "undefined" || !$("#radar")) return;
    const th = ["Slope", "Roughness", "Aridity", "Temp. range"];
    const tr = (x, name, color, dash, fill) => ({ type: "scatterpolar", r: COMPONENT_ORDER.map((k) => x.similarity.components[k]).concat([x.similarity.components[COMPONENT_ORDER[0]]]),
      theta: th.concat([th[0]]), name, mode: "lines+markers", line: { color, width: 2, dash }, marker: { size: 5, color }, fill, fillcolor: fill ? "rgba(183,255,0,.16)" : undefined,
      hovertemplate: "%{theta}: %{r:.0f}/100<extra>" + esc(name) + "</extra>" });
    const best = ranked(s.analog_of)[0];
    const data = [tr(s, s.info.short, "#B7FF00", "solid", "toself")];
    if (best.id !== s.id) data.push(tr(best, `#1 ${best.info.short}`, BODY_COLOR[s.analog_of], "dot"));
    Plotly.newPlot("radar", data, {
      paper_bgcolor: "rgba(0,0,0,0)", font: { color: "#EAF0F5", family: "Inter", size: 11 }, margin: { l: 40, r: 40, t: 20, b: 20 },
      showlegend: data.length > 1, legend: { orientation: "h", y: -0.08, x: 0.5, xanchor: "center" },
      polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { range: [0, 100], tickvals: [25, 50, 75, 100], gridcolor: "rgba(130,147,165,.25)", tickfont: { size: 9, color: "#8293A5" }, angle: 90 },
        angularaxis: { gridcolor: "rgba(130,147,165,.25)", rotation: 90, direction: "clockwise" } },
    }, { responsive: true, displaylogo: false, displayModeBar: false });
  }
  // Earth square and planetary target square in 3D, same size and same vertical scale
  let targetTerrain = null;
  const loadTargets = () => targetTerrain || (targetTerrain = window.NT_BUNDLE && window.NT_BUNDLE.targets ? Promise.resolve(window.NT_BUNDLE.targets)
    : fetch("data/targets_terrain.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  function gridMesh(t, step, withRgb) {
    const zq = b64(t.z_dm_u16, Uint16Array), rgb = withRgb && t.rgb_u8 ? b64(t.rgb_u8, Uint8Array) : null;
    const cols = Math.ceil(t.nx / step), rows = Math.ceil(t.ny / step);
    const dx = (t.x[1] - t.x[0]) / (t.nx - 1), dy = (t.y[1] - t.y[0]) / (t.ny - 1);
    const X = [], Y = [], Z = [], VC = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const rr = Math.min(r * step, t.ny - 1), cc = Math.min(c * step, t.nx - 1), n = rr * t.nx + cc;
      X.push(cc * dx); Y.push(rr * dy); Z.push(zq[n] / 10);
      if (rgb) VC.push(`rgb(${rgb[n * 3]},${rgb[n * 3 + 1]},${rgb[n * 3 + 2]})`);
    }
    const I = [], J = [], K = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; I.push(a, b); J.push(b, e); K.push(d, d); }
    return { X, Y, Z, VC, I, J, K, relief: Math.max(...Z), w: t.x[1] - t.x[0], h: t.y[1] - t.y[0] };
  }
  async function mountTwin(s, t) {
    const a = $("#twin-earth"), b = $("#twin-target");
    if (!a || typeof Plotly === "undefined") return;
    if (!hasWebGL) { a.outerHTML = noGL("The 3D view"); b.outerHTML = noGL("The 3D view"); return; }
    let es, ts;
    try { es = await loadTerrain(s.id); ts = (await loadTargets())[s.target]; } catch (e) { es = null; }
    if (!a.isConnected) return;
    if (!es || !ts) { $("#twin-card").style.display = "none"; return; }
    const E = gridMesh(es, 2, true), T = gridMesh(ts, 2, false);
    const zmax = Math.max(E.relief, T.relief, 1), size = Math.max(E.w, E.h, T.w, T.h);
    const light = { ambient: 0.5, diffuse: 0.9, fresnel: 0.1, roughness: 0.9, specular: 0.05 }, lp = { x: -5e4, y: 5e4, z: 1e5 };
    const hov = "x %{x:.1f} km<br>y %{y:.1f} km<br>%{z:.0f} m above lowest point<extra></extra>";
    const scale = t.body === "Mars" ? [[0, "#3a1d12"], [0.5, "#a8532c"], [1, "#f2b38a"]] : [[0, "#1d2229"], [0.5, "#7d848c"], [1, "#e6e9ec"]];
    const layout = (ex) => ({ paper_bgcolor: "#050B14", margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, font: { color: "#EAF0F5", family: "Inter" },
      scene: { aspectmode: "manual", aspectratio: { x: 1, y: 1, z: (zmax / (size * 1000)) * ex },
        xaxis: { title: { text: "km" }, range: [0, size], gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        yaxis: { title: { text: "km" }, range: [0, size], gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        zaxis: { title: { text: "m" }, range: [0, zmax], gridcolor: "#1a2a3e", backgroundcolor: "#050B14", color: "#8293A5" },
        camera: { eye: { x: 1.1, y: -1.1, z: 0.75 } } } });
    const cfg = { responsive: true, displaylogo: false, displayModeBar: false };
    await Plotly.newPlot(a, [{ type: "mesh3d", x: E.X, y: E.Y, z: E.Z, i: E.I, j: E.J, k: E.K, vertexcolor: E.VC, lighting: light, lightposition: lp, hovertemplate: hov }], layout(2), cfg);
    await Plotly.newPlot(b, [{ type: "mesh3d", x: T.X, y: T.Y, z: T.Z, i: T.I, j: T.J, k: T.K, intensity: T.Z, colorscale: scale, showscale: false, lighting: light, lightposition: lp, hovertemplate: hov }], layout(2), cfg);
    // keep both cameras in step
    let syncing = false;
    const link = (from, to) => from.on("plotly_relayout", (ev) => {
      if (syncing || !ev["scene.camera"]) return;
      syncing = true; Plotly.relayout(to, { "scene.camera": ev["scene.camera"] }).then(() => { syncing = false; });
    });
    link(a, b); link(b, a);
    $("#tx").onclick = (e) => { const x = e.target.closest("[data-x]"); if (!x) return;
      document.querySelectorAll("#tx .chip").forEach((c) => c.classList.toggle("on", c === x));
      const z = (zmax / (size * 1000)) * Number(x.dataset.x);
      Plotly.relayout(a, { "scene.aspectratio.z": z }); Plotly.relayout(b, { "scene.aspectratio.z": z }); };
  }
  function mountMap(s) {
    if (typeof L === "undefined") return;
    const half = state.data.analysis_area_km / 2;
    const dLat = half / 110.574;
    const dLon = half / (111.32 * Math.cos((s.lat * Math.PI) / 180));
    const b = [[s.lat - dLat, s.lon - dLon], [s.lat + dLat, s.lon + dLon]];
    const map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    sentinelImage(s.id).then((url) => { if (state.map === map) L.imageOverlay(url, b, { opacity: 1, attribution: "Sentinel-2 L2A (ESA/Copernicus)" }).addTo(map).bringToFront(); }).catch(() => {});
    L.rectangle(b, { color: "#B7FF00", weight: 2, fill: false }).addTo(map);
    L.circleMarker([s.lat, s.lon], { radius: 4, color: "#00D9FF", fillOpacity: 1 }).addTo(map);
    map.fitBounds(b, { padding: [24, 24] });
    state.map = map;
  }
  function mountProfile(s, t) {
    if (typeof Plotly === "undefined" || !s.terrain_profile) return;
    const rel = (arr) => { const z = arr.filter((v) => v !== null); const mn = Math.min(...z); return arr.map((v) => (v === null ? null : v - mn)); };
    const traces = [
      { x: s.terrain_profile.distance_km, y: rel(s.terrain_profile.elevation_m), name: s.info.short, mode: "lines", line: { color: "#B7FF00", width: 2.5 } },
    ];
    if (t.terrain_profile) traces.push({ x: t.terrain_profile.distance_km, y: rel(t.terrain_profile.elevation_m), name: t.name.split(" — ")[0], mode: "lines", line: { color: BODY_COLOR[t.body], width: 2, dash: "dot" } });
    Plotly.newPlot("profile", traces, {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "#EAF0F5", family: "Inter" },
      margin: { l: 56, r: 16, t: 10, b: 44 }, legend: { orientation: "h", y: 1.14, x: 0, entrywidthmode: "pixels", entrywidth: 260 },
      xaxis: { title: { text: "Distance (km)" }, gridcolor: "rgba(130,147,165,.18)", zeroline: false },
      yaxis: { title: { text: "Height above lowest point (m)" }, gridcolor: "rgba(130,147,165,.18)", zeroline: false },
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] });
    // re-measure the legend once web fonts are loaded (avoids clipped names)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const el = document.getElementById("profile"); if (el && el.data) Plotly.relayout(el, {}); });
  }

  // Resources listed by the challenge and how this project uses them
  const CHALLENGE_RESOURCES = [
    [true, "NASA Planetary Data System (PDS)", "LRO Diviner Polar Resource Product, read directly from the PDS archive."],
    [true, "NASA Lunar Reconnaissance Orbiter (LRO)", "LOLA 5 m topography of the Shackleton rim (lunar target terrain)."],
    [true, "NASA LRO Diviner Lunar Data", "Annual maximum and average temperatures at the lunar target."],
    [true, "NASA Worldview", "Linked from every field log for the site's satellite time series."],
    [true, "ESA Copernicus", "Copernicus DEM GLO-30 (terrain) and Sentinel-2 L2A true colour (imagery)."],
    [true, "NASA Earth science data", "Climate from NASA POWER (MERRA-2, NASA GMAO), daily, 2015–2024."],
    [false, "CSA RADARSAT · JAXA G-Portal · ESA Open Science Catalog", "Not used in this version."],
  ];
  const resourcesCard = () => `<div class="card panel"><h3>Challenge resources used <small>FROM THE SPACE APPS RESOURCE LIST</small></h3>
    <ul class="res-list">${CHALLENGE_RESOURCES.map(([u, n, t]) => `<li class="${u ? "used" : "unused"}"><i>${u ? "✓" : "–"}</i><b>${n}</b><span>${t}</span></li>`).join("")}</ul></div>`;

  // Earth cannot reproduce these conditions (values from NASA fact sheets and in-situ measurements)
  const LIMITS = [
    ["Surface gravity", "9.81 m/s² (1 g)", "1.62 m/s² (0.17 g)", "3.71 m/s² (0.38 g)"],
    ["Surface pressure", "≈1013 hPa", "≈0 (exosphere, near vacuum)", "≈6 hPa"],
    ["Atmosphere", "N₂ 78 %, O₂ 21 %", "negligible (exosphere)", "CO₂ ≈95 %"],
    ["Surface radiation dose", "≈0.007 mSv/day", "≈1.37 mSv/day (Chang'e 4)", "≈0.67 mSv/day (Curiosity RAD)"],
    ["Length of day", "24 h", "≈29.5 Earth days", "≈24 h 40 min"],
  ];
  const limitsCard = () => `<div class="card panel"><h3>Earth's limits as an analogue <small>APPLIES TO EVERY SITE</small></h3>
    <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Earth</th><th>Moon</th><th>Mars</th></tr></thead>
    <tbody>${LIMITS.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:10px">No place on Earth reproduces reduced gravity, the lunar vacuum, the thin Martian atmosphere or their radiation environments. Our index compares terrain and climate only; these differences apply equally to all ${sites().length} sites.
    Sources: NASA NSSDCA Moon and Mars fact sheets; Zhang et al. (2020), Science Advances, <a class="cyan" href="https://doi.org/10.1126/sciadv.aaz1334" target="_blank" rel="noopener">doi:10.1126/sciadv.aaz1334</a>; Hassler et al. (2014), Science, <a class="cyan" href="https://doi.org/10.1126/science.1244797" target="_blank" rel="noopener">doi:10.1126/science.1244797</a>.</p></div>`;

  // Weight sensitivity: re-rank the sites with every weight set (each weight 0.10–0.50 in steps of 0.05, summing to 1)
  function sensitivity(body) {
    const vals = []; for (let i = 0; i <= 8; i++) vals.push(0.1 + 0.05 * i);
    const W = [];
    vals.forEach((a) => vals.forEach((b) => vals.forEach((c) => vals.forEach((d) => { if (Math.abs(a + b + c + d - 1) < 1e-9) W.push([a, b, c, d]); }))));
    const S = ranked(body), first = {}, rk = {};
    S.forEach((s) => { first[s.id] = 0; rk[s.id] = []; });
    W.forEach((w) => {
      const r = S.map((s) => [s, COMPONENT_ORDER.reduce((t, k, i) => t + w[i] * s.similarity.components[k], 0)]).sort((x, y) => y[1] - x[1]);
      first[r[0][0].id]++; r.forEach(([s], i) => rk[s.id].push(i + 1));
    });
    return { n: W.length, rows: S.map((s) => ({ s, pct: (100 * first[s.id]) / W.length, best: Math.min(...rk[s.id]), worst: Math.max(...rk[s.id]) })) };
  }
  function sensitivityCard() {
    const M = sensitivity("Mars"), L = sensitivity("Moon");
    const tbl = (b, R) => `<div><div class="eyebrow plain" style="margin-bottom:6px">${b} analogues</div><div class="table-wrap"><table class="data"><thead><tr><th>Site</th><th>Our rank</th><th>#1 in</th><th>Rank range</th></tr></thead>
      <tbody>${R.rows.map((r, i) => `<tr><td><a href="#field-${r.s.id}">${esc(r.s.info.short)}</a></td><td class="num">${i + 1}</td><td class="num ${r.pct >= 50 ? "lime" : ""}">${fmt(r.pct, 0)} %</td><td class="num">${r.best === r.worst ? r.best : r.best + "–" + r.worst}</td></tr>`).join("")}</tbody></table></div></div>`;
    const top = (R) => R.rows.slice().sort((a, b) => b.pct - a.pct)[0];
    const tm = top(M), tl = top(L);
    return `<div class="card panel" id="sens"><h3>Do the results depend on our weights? <small>SENSITIVITY TEST · ${M.n} WEIGHT SETS</small></h3>
      <p class="note">Our weights (slope 0.3, roughness 0.3, aridity 0.3, temperature 0.1) are a team choice. Here every site is re-ranked with all ${M.n} weight sets in which each weight goes from 0.10 to 0.50 (steps of 0.05) and the four add up to 1. <b>${esc(tm.s.info.short)} is #1 for Mars in ${fmt(tm.pct, 0)} % of them and never ranks below #${tm.worst}; ${esc(tl.s.info.short)} is #1 for the Moon in ${fmt(tl.pct, 0)} % and never ranks below #${tl.worst}.</b> The leaders do not depend on our particular weights.</p>
      <div class="grid-2" style="margin-top:12px">${tbl("Mars", M)}${tbl("Moon", L)}</div></div>`;
  }

  // ---------- Compare ----------
  function renderCompare() {
    const d = state.data;
    const tCard = (t) => {
      const tm = (k) => mv(t, k);
      const div = t.metrics.diviner_temp_max_c ? `<li>Diviner (LRO) at the target: annual max surface ${fmt(tm("diviner_temp_max_c"), 1)} °C, annual average ${fmt(tm("diviner_temp_avg_c"), 1)} °C (${t.diviner_cells || "—"} cells; context only).</li>` : "";
      return `<div class="card panel target-card">
        <span class="tag ${t.body.toLowerCase()}">${t.body} target</span>
        <div class="big">${esc(t.name)}</div>
        <ul class="plain">
          <li>Mean slope ${fmt(tm("slope_mean_deg"))}° · roughness ${fmt(tm("roughness_m"))} m</li>
          <li>Relief ${fmt(tm("elevation_max_m") - tm("elevation_min_m"), 0)} m in the 10 × 10 km square</li>
          <li>Temperature range ${fmt(tm("temp_range_c"), 0)} °C · precipitation ${fmt(tm("precip_annual_mm"), 0)} mm</li>
          ${div}
          <li class="muted">${esc(t.notes || "")}</li>
        </ul></div>`;
    };
    const table = (body) => `
      <div class="card panel">
        <h3>${body} analogues <small>VS ${esc(Object.values(d.targets).find((t) => t.body === body).name.toUpperCase())}</small></h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>Site</th><th>Type</th><th>Country</th><th>Score</th><th>Slope °</th><th>Roughness m</th><th>Temp range °C</th><th>Precip mm</th><th>Slope</th><th>Rough.</th><th>Aridity</th><th>Temp</th></tr></thead>
          <tbody>${ranked(body).map((s, i) => `<tr>
            <td class="num">${i + 1}</td><td><a href="#field-${s.id}">${esc(s.info.short)}</a></td><td>${catTag(s)}</td><td>${esc(s.country)}</td>
            <td class="num lime">${fmt(s.similarity.score, 1)}</td>
            <td class="num">${fmt(mv(s, "slope_mean_deg"))}</td><td class="num">${fmt(mv(s, "roughness_m"))}</td><td class="num">${fmt(mv(s, "temp_range_c"))}</td><td class="num">${fmt(mv(s, "precip_annual_mm"))}</td>
            ${COMPONENT_ORDER.map((k) => `<td class="num muted">${fmt(s.similarity.components[k], 0)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>
        <div id="chart-${body}" class="plot" style="height:${60 + ranked(body).length * 34}px;margin-top:10px"></div>
      </div>`;
    const wts = d.similarity_method.weights;
    view.innerHTML = `
    <section class="page">
      <div class="page-title"><div class="eyebrow">Expedition 04 / Compare</div><h1>How close is Earth?</h1>
        <p>All ${sites().length} sites ranked against their planetary target with one method and one set of open data sources.</p></div>
      <div class="grid-2">${tCard(d.targets.jezero)}${tCard(d.targets["lunar-south-pole"])}</div>
      ${table("Mars")}
      ${table("Moon")}
      ${sensitivityCard()}
      <div class="grid-2">
        <div class="card panel"><h3>Method</h3>
          <p class="note">${esc(d.similarity_method.description)}</p>
          <ul class="plain">${COMPONENT_ORDER.map((k) => `<li>${METRIC_LABELS[k][0]}: weight ${Math.round(wts[k] * 100)} %</li>`).join("")}
            <li>Analysis area: ${d.analysis_area_km} × ${d.analysis_area_km} km per site; all terrain compared at ≈30 m.</li></ul></div>
        <div class="card panel"><h3>Known limitations</h3><ul class="plain">${d.known_limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>
      </div>
      ${limitsCard()}
      ${resourcesCard()}
      <div class="card panel"><h3>Data sources</h3><ul class="src-list">${Object.keys(d.sources).map(sourceItem).join("")}</ul></div>
      ${nextStep("05 Discover", "Search a whole region", "The same index applied to every 10 × 10 km cell of a search zone, to find analogues nobody has proposed yet.", "#discover", "Open Discover")}
      <div class="footer-line"><span>NASA INTERNATIONAL <span class="lime">SPACE APPS CHALLENGE 2026</span></span><span>DATA GENERATED ${esc((d.generated_utc || "").slice(0, 10))}</span></div>
    </section>`;
    if (typeof Plotly !== "undefined") ["Mars", "Moon"].forEach((b) => {
      const r = ranked(b).slice().reverse();
      Plotly.newPlot(`chart-${b}`, COMPONENT_ORDER.map((k, i) => ({
        type: "bar", orientation: "h", name: ["Slope", "Roughness", "Aridity", "Temp. range"][i], y: r.map((s) => s.info.short),
        x: r.map((s) => s.similarity.components[k] * wts[k]), marker: { color: ["#B7FF00", "#00D9FF", "#1677FF", "#8293A5"][i] },
        hovertemplate: "%{y}: %{x:.1f} points<extra>" + METRIC_LABELS[k][0] + "</extra>",
      })), {
        barmode: "stack", paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "#EAF0F5", family: "Inter", size: 12 },
        margin: { l: 130, r: 16, t: 34, b: 44 }, legend: { orientation: "h", y: 1.0, yanchor: "bottom", x: 0, traceorder: "normal", font: { size: 11 }, entrywidthmode: "pixels", entrywidth: 120 },
        xaxis: { title: { text: "Weighted contribution to score (0–100)" }, range: [0, 100], gridcolor: "rgba(130,147,165,.18)" },
      }, { responsive: true, displaylogo: false, displayModeBar: false });
    });
  }

  // ---------- Discover ----------
  const haversine = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const NEW_FIND_KM = 50;
  const FAM_COLORS = ["#B7FF00", "#00D9FF", "#B36BFF", "#FFB020", "#FF5C8A", "#8293A5"];
  function mlCard(ML, Z) {
    const count = (arr, f) => arr.filter((x) => x === f).length;
    const marsTop = ML.top20_mars_families, moonTop = ML.top20_moon_families;
    const domM = ML.families.map((f) => [f, count(marsTop, f.id)]).sort((a, b) => b[1] - a[1])[0];
    const domL = ML.families.map((f) => [f, count(moonTop, f.id)]).sort((a, b) => b[1] - a[1])[0];
    const members = (f) => sites().filter((s) => ML.sites[s.id] === f.id).map((s) => esc(s.info.short)).join(", ") || "—";
    return `<div class="card panel"><h3>Machine learning: terrain families <small>K-MEANS · ${ML.n_cells} CELLS · ${Object.keys(state.discover.zones).length} ZONES</small></h3>
      <p class="note">An unsupervised algorithm (k-means, k = ${ML.k} chosen by silhouette score ${fmt(ML.silhouette, 2)}) grouped all ${ML.n_cells} cells by their four metrics, <b>without our weights or targets</b>. Our ${sites().length} sites were then placed in the nearest family.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Family</th><th>Cells</th><th>Median slope °</th><th>Roughness m</th><th>Precip mm</th><th>Temp range °C</th><th>Mean Mars score</th><th>Mean Moon score</th><th>Our sites in it</th></tr></thead>
      <tbody>${ML.families.map((f) => `<tr><td><span class="fam"><i style="background:${FAM_COLORS[f.id]}"></i></span><b>${esc(f.label)}</b></td><td class="num">${f.n}</td><td class="num">${fmt(f.median.slope_mean_deg, 1)}</td><td class="num">${fmt(f.median.roughness_m, 2)}</td><td class="num">${fmt(f.median.precip_annual_mm, 0)}</td><td class="num">${fmt(f.median.temp_range_c, 1)}</td><td class="num">${fmt(f.mars_mean, 1)}</td><td class="num">${fmt(f.moon_mean, 1)}</td><td>${members(f)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin-top:10px"><b>What it shows:</b> ${domM[1]} of the 20 best Mars cells fall in the "${esc(domM[0].label)}" family, the same family as ${members(domM[0])}. For the Moon, ${domL[1]} of the 20 best cells are in "${esc(domL[0].label)}": the Moon score is driven mostly by aridity, so the families separate Mars-like plains more clearly than Moon-like terrain. The families describe terrain and climate types; they do not decide which target a site resembles.</p></div>`;
  }
  function renderDiscover(param) {
    const D = state.discover;
    if (!D || !Object.keys(D.zones || {}).length) {
      view.innerHTML = `<section class="page"><div class="page-title"><div class="eyebrow">Expedition 05 / Discover</div><h1>Search for new analogues</h1><p>The zone search has not been generated yet.</p></div></section>`;
      return;
    }
    const zones = Object.keys(D.zones);
    if (!state.zone || !D.zones[state.zone]) state.zone = zones[0];
    if (param) state.dbody = param.toLowerCase() === "moon" ? "Moon" : "Mars";
    if (!state.dbody) state.dbody = "Mars";
    const Z = D.zones[state.zone], key = state.dbody === "Mars" ? "mars" : "moon", ckey = key + "_c";
    const ML = D.ml || null;
    if (!state.dmode || !ML) state.dmode = state.dmode && ML ? state.dmode : "score";
    const tgt = Object.values(state.data.targets).find((t) => t.body === state.dbody);
    const known = sites().filter((s) => s.lat >= Z.south - 0.05 && s.lat <= Z.north + 0.05 && s.lon >= Z.west - 0.05 && s.lon <= Z.east + 0.05);
    const nearest = (c) => sites().map((s) => ({ s, d: haversine(c.lat, c.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    const cells = Z.cells.slice().sort((a, b) => b[key] - a[key]);
    cells.forEach((c, i) => { c._rank = i + 1; c._near = nearest(c); });
    const top = cells.slice(0, 10);
    const best = ranked(state.dbody)[0];
    const lo = cells[cells.length - 1][key], hi = cells[0][key];
    view.innerHTML = `
    <section class="page">
      <div class="page-title"><div class="eyebrow">Expedition 05 / Discover</div><h1>Search for new analogues</h1>
        <p>The ${sites().length} sites were chosen by us. Here the same index scores <b>every 10 × 10 km land cell</b> of a search zone, so it can point to places nobody has proposed.</p></div>
      <div class="card panel disc-controls" id="disc-controls">
        <div><div class="label">SEARCH ZONE</div><div class="chips" id="zone-chips">${zones.map((z) => `<button class="chip${z === state.zone ? " on" : ""}" data-zone="${z}">${esc(D.zones[z].name)}</button>`).join("")}</div></div>
        <div><div class="label">COMPARE WITH</div><div class="chips" id="dbody-chips">${["Mars", "Moon"].map((b) => `<button class="chip${b === state.dbody ? " on" : ""}" data-b="${b}">${b}</button>`).join("")}</div></div>
        ${ML ? `<div><div class="label">COLOUR MAP BY</div><div class="chips" id="dmode-chips">${[["score", "Similarity"], ["ml", "Terrain family (ML)"]].map(([k, n]) => `<button class="chip${k === state.dmode ? " on" : ""}" data-m="${k}">${n}</button>`).join("")}</div></div>` : ""}
        <div class="disc-stats"><span><b>${Z.cells.length}</b> land cells</span><span>best <b class="lime">${fmt(hi, 1)}</b></span><span>our #1 ${esc(state.dbody)} site: <b>${esc(best.info.short)} ${fmt(best.similarity.score, 1)}</b></span></div>
      </div>
      <div class="disc-grid">
        <div class="card panel"><h3>Similarity map <small>${esc(Z.name.toUpperCase())} · VS ${esc(tgt.name.split(" — ")[0].toUpperCase())}</small></h3>
          <div id="disc-map" class="map disc-map"></div>
          ${state.dmode === "ml" ? `<div class="disc-legend">${ML.families.map((f) => `<span class="fam"><i style="background:${FAM_COLORS[f.id]}"></i>${esc(f.label)}</span>`).join("")}<span class="muted"><span class="lime">◆</span> our sites</span></div>`
            : `<div class="disc-legend"><span>${fmt(lo, 0)}</span><i style="background:linear-gradient(90deg,#13233A,${BODY_COLOR[state.dbody]})"></i><span>${fmt(hi, 0)}</span><span class="muted">similarity · <span class="lime">◆</span> our sites</span></div>`}
        </div>
        <div class="card panel" id="disc-top"><h3>Top 10 cells <small>CLICK FOR DETAILS</small></h3>
          <ol class="disc-list">${top.map((c) => `<li data-r="${c._rank}"><span class="n">${c._rank}</span><span><b>${fmt(c.lat, 3)}°, ${fmt(c.lon, 3)}°</b><small>${c._near.d > NEW_FIND_KM ? '<span class="tag cat-new">New find</span> ' : ""}${fmt(c._near.d, 0)} km from ${esc(c._near.s.info.short)} · ${fmt(c.elev, 0)} m</small></span><span class="score">${fmt(c[key], 1)}</span></li>`).join("")}</ol>
          <div id="disc-detail"></div>
        </div>
      </div>
      <div class="card panel"><h3>How the search works</h3><p class="note">${esc(D.method)} Ocean cells are skipped (${Z.skipped_ocean_cells}). A cell is marked <b>New find</b> when it is more than ${NEW_FIND_KM} km from all of our ${sites().length} sites. Scores are for a 10 × 10 km square: a high score is a lead to check on satellite imagery and in the field, not a confirmed analogue. Generated ${esc((Z.generated_utc || "").slice(0, 10))}.</p></div>
      ${ML ? mlCard(ML, Z) : ""}
      ${nextStep("02 Atlas", "Explore the analogue sites", `Go back to the globe and open any of the ${sites().length} field logs.`, "#atlas", "Back to the Atlas")}
      <div class="footer-line"><span>NASA INTERNATIONAL <span class="lime">SPACE APPS CHALLENGE 2026</span></span><span>EXPLORE · OBSERVE · COMPARE</span></div>
    </section>`;
    $("#zone-chips").onclick = (e) => { const b = e.target.closest("[data-zone]"); if (b) { state.zone = b.dataset.zone; route(); } };
    if ($("#dmode-chips")) $("#dmode-chips").onclick = (e) => { const b = e.target.closest("[data-m]"); if (b) { state.dmode = b.dataset.m; route(); } };
    $("#dbody-chips").onclick = (e) => { const b = e.target.closest("[data-b]"); if (b) { location.hash = `#discover-${b.dataset.b.toLowerCase()}`; } };
    const detail = (c) => {
      $("#disc-detail").innerHTML = `<div class="disc-detail">
        <div class="eyebrow plain">Cell #${c._rank} · ${fmt(c.lat, 3)}°, ${fmt(c.lon, 3)}°</div>
        <div class="disc-score"><span class="score">${fmt(c[key], 1)}</span><span class="muted">vs ${esc(state.dbody)} · nearest of our sites: ${esc(c._near.s.info.short)} (${fmt(c._near.d, 0)} km, ${fmt(c._near.s.similarity.score, 1)})</span></div>
        <div class="bars">${COMPONENT_ORDER.map((k) => `<div class="bar-row"><span>${METRIC_LABELS[k][0]}</span><div class="bar"><div style="width:${Math.max(0, Math.min(100, c[ckey][k]))}%"></div></div><span class="v">${fmt(c[ckey][k], 0)}</span></div>`).join("")}</div>
        ${ML && c.f !== undefined ? `<p class="note"><span class="fam"><i style="background:${FAM_COLORS[c.f]}"></i></span>Terrain family (ML): <b>${esc(ML.families[c.f].label)}</b></p>` : ""}
        <p class="note">Slope ${fmt(c.slope_mean_deg, 1)}° · roughness ${fmt(c.roughness_m, 2)} m · temperature range ${fmt(c.temp_range_c, 1)} °C · precipitation ${fmt(c.precip_annual_mm, 0)} mm/yr · elevation ${fmt(c.elev, 0)} m · relief ${fmt(c.relief, 0)} m</p>
        <div class="links"><a class="btn btn-secondary" href="https://earth.google.com/web/@${c.lat},${c.lon},${c.elev}a,16000d,35y,0h,45t,0r" target="_blank" rel="noopener">Google Earth <span class="arrow">↗</span></a><a class="btn btn-secondary" href="https://worldview.earthdata.nasa.gov/?v=${c.lon - 0.3},${c.lat - 0.2},${c.lon + 0.3},${c.lat + 0.2}" target="_blank" rel="noopener">NASA Worldview <span class="arrow">↗</span></a></div></div>`;
    };
    if (typeof L === "undefined") return;
    const map = L.map("disc-map", { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(map);
    const mix = (t) => { const a = [0x13, 0x23, 0x3a], b = BODY_COLOR[state.dbody].match(/\w\w/g).map((h) => parseInt(h, 16)); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`; };
    const dlat = D.cell_km / 110.574 / 2;
    const rects = {};
    let sel = null;
    const pick = (c, pan) => {
      if (sel) sel.setStyle({ weight: 0.4, color: "#050B14" });
      sel = rects[c._rank]; sel.setStyle({ weight: 2.5, color: "#B7FF00" }); sel.bringToFront();
      document.querySelectorAll(".disc-list li").forEach((li) => li.classList.toggle("on", Number(li.dataset.r) === c._rank));
      detail(c); if (pan) map.panTo([c.lat, c.lon]);
    };
    cells.forEach((c) => {
      const dlon = D.cell_km / (111.32 * Math.cos((c.lat * Math.PI) / 180)) / 2;
      const t = (c[key] - lo) / Math.max(1e-6, hi - lo), byML = state.dmode === "ml" && c.f !== undefined;
      rects[c._rank] = L.rectangle([[c.lat - dlat, c.lon - dlon], [c.lat + dlat, c.lon + dlon]], { weight: 0.4, color: "#050B14", fillColor: byML ? FAM_COLORS[c.f] : mix(t), fillOpacity: byML ? 0.6 : 0.35 + 0.5 * t })
        .bindTooltip(`#${c._rank} · ${fmt(c[key], 1)}${byML ? " · " + esc(ML.families[c.f].label) : ""}`, { sticky: true }).on("click", () => pick(c)).addTo(map);
    });
    known.forEach((s) => L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "disc-site", html: `<span>◆ ${esc(s.info.short)}</span>`, iconSize: null }) }).addTo(map).on("click", () => { location.hash = `#field-${s.id}`; }));
    map.fitBounds([[Z.south, Z.west], [Z.north, Z.east]], { padding: [10, 10] });
    state.map = map;
    $("#disc-top").onclick = (e) => { const li = e.target.closest("li[data-r]"); if (li) pick(cells[Number(li.dataset.r) - 1], true); };
    pick(top[0]);
  }

  // ---------- About ----------
  function renderAbout() {
    view.innerHTML = `
    <section class="page">
      <div class="about-hero panel">
        <div class="eyebrow">About / NovaTerra Labs</div>
        <h1 style="font-size:clamp(28px,2.6vw,42px);margin:10px 0 12px">Identify Earth locations that analog<br>the permanent Moon base locations and Mars.</h1>
        <p class="note" style="font-size:15px;max-width:820px">Our answer to the NASA International Space Apps Challenge 2026. We built an open, reproducible pipeline that measures terrain and climate on Earth and on two planetary targets — the Shackleton rim near the lunar south pole (a candidate Artemis base region) and Jezero crater on Mars (Perseverance landing site) — and scores how alike they are.</p>
        <div class="links"><a class="btn btn-primary" href="#atlas">Open the Atlas <span>→</span></a><a class="btn btn-secondary" href="#compare">See the rankings <span class="arrow">→</span></a></div>
      </div>
      <div class="steps">
        ${step("01", "Measure terrain", "Copernicus DEM (30 m) on Earth; USGS CTX DTM for Jezero and NASA LOLA (5 m) for the Moon, all compared at ≈30 m. Slope and roughness for each 10 × 10 km square.")}
        ${step("02", "Measure climate", "NASA POWER daily data (MERRA-2), 2015–2024: daily temperature range and annual precipitation, adjusted to site elevation.")}
        ${step("03", "Score similarity", "Four partial scores — slope, roughness, aridity and temperature range — combined into one 0–100 index with fixed weights.")}
        ${step("04", "Explore and discover", "Globe, satellite close-ups, 3D terrain and profiles for every site; Discover searches whole zones cell by cell, with machine-learning terrain families.")}
      </div>
      <div class="card panel"><h3>Reference analogues and new candidates</h3><p class="note">Eight of our sites are <b>reference analogues</b>: well-studied places already used by NASA and other agencies (Atacama, Haughton, McMurdo, Askja, Mauna Kea, Meteor Crater, Craters of the Moon, Lanzarote). They benchmark the index. Seven are <b>new candidates</b> that have received much less attention (La Pampa de la Joya, Salar de Pajonales, Campo de Piedra Pómez, Andahua, Makgadikgadi, Cerro Chao, Monturaqui). A new candidate that scores as high as a reference site is a strong lead: La Pampa de la Joya ranks first among all Mars analogues, above the Atacama Desert, and Cerro Chao ranks first among all Moon analogues, above Lanzarote. Cerro Chao and Monturaqui are new <b>lunar</b> candidates in the Atacama, a region known mainly for Mars analogues: what makes them lunar analogues is the landform (a silicic lava dome, a simple impact crater), not the region.</p></div>
      ${limitsCard()}
      <div class="card panel"><h3>Next steps</h3><ul class="plain">
        <li><b>Illumination:</b> add LOLA illumination maps for the lunar south pole and sunlight duration for each Earth site.</li>
        <li><b>Water and ice:</b> compare Diviner ice-stability areas with permafrost and ground-ice data on Earth.</li>
        <li><b>Dust and wind:</b> add wind and dust from NASA data and compare with Perseverance MEDA measurements at Jezero.</li>
        <li><b>Caves and lava tubes:</b> map lava tubes at the volcanic sites against lunar pits seen by LRO.</li>
        <li><b>Wider search:</b> extend Discover from three zones to whole countries and to the rest of the Americas.</li></ul></div>
      ${resourcesCard()}
      <div class="card panel"><h3>Team</h3><p class="note"><b>NovaTerra Labs</b> — NASA Space Apps Challenge 2026: Fátima Herrera (team owner) and Romy Lostaunau, Peru <svg class="flag-pe" viewBox="0 0 3 2" role="img" aria-label="Flag of Peru"><rect width="3" height="2" fill="#D91023"/><rect x="1" width="1" height="2" fill="#fff"/></svg>. Data pipeline developed in Google Colab (Python); this app is a static site with no build step, ready for GitHub Pages.</p></div>
      <div class="footer-line"><span>NASA INTERNATIONAL <span class="lime">SPACE APPS CHALLENGE 2026</span></span><span>EXPLORE · OBSERVE · COMPARE</span></div>
    </section>`;
  }
  const step = (n, h, p) => `<div class="card panel step"><b>${n}</b><h3>${h}</h3><p>${p}</p></div>`;

  // ---------- Guided tour: short notes that slide in as each part of the screen scrolls into view ----------
  const TOUR = {
    bridge: [
      [".launcher", "Welcome aboard. We compare places on Earth with the Moon's south pole and Mars' Jezero crater. See our best analogues under Mission findings, choose a frontier below, or follow the mission path 01 → 04 at the top. These notes will guide you on every screen.", "append"],
    ],
    atlas: [
      [".page-title", "Click a dot on the globe, or a card under it, to see that site's score in Site insight.", "append"],
      [".search", "Pick a target (Moon or Mars) and filter by site type and environment.", "append"],
      [".atlas-next", "When you find an interesting site, open its field log for the full data.", "prepend"],
    ],
    field: [
      [".field-head", "The similarity score (0–100) says how close this square is to its planetary target. Use the selector to switch site."],
      ["#viewer-slot", "Real terrain in 3D: drag to rotate, and raise the vertical exaggeration to see the relief."],
      ["#twin-card", "The Earth square next to the Moon or Mars square, at the same scale. Rotate one and the other follows."],
      ["#radar", "Each axis is one partial score; the further out, the closer to the target. If this is not the #1 site, a dotted shape shows the #1 site for comparison."],
      ["#profile", "A west–east cut through both squares."],
    ],
    compare: [
      [".target-card", "These are the two planetary targets every Earth site is measured against.", "prepend"],
      [".table-wrap", "All sites ranked. The four last columns are the partial scores behind each total."],
      ["#sens", "A test of our own choice: the rankings recomputed with 375 different weight sets.", "prepend"],
      [".res-list", "Which of the challenge's suggested data resources we used."],
    ],
    discover: [
      [".page-title", "Here the index searches a whole zone instead of sites we chose: every 10 × 10 km land cell gets a score.", "append"],
      ["#disc-controls", "Choose the search zone and whether to compare with Mars or the Moon.", "prepend"],
      ["#disc-top", "The best cells. Cells more than 50 km from any of our sites are marked as new finds; click one to see why it scores.", "prepend"],
    ],
    about: [[".steps", "How the index is built, in four steps."]],
  };
  let tourObs = null;
  const tourOn = () => { try { return localStorage.getItem("nt-tour") !== "off"; } catch (e) { return true; } };
  function setTour(on) { try { localStorage.setItem("nt-tour", on ? "on" : "off"); } catch (e) { /* storage unavailable */ } }
  function tour(name) {
    if (tourObs) { tourObs.disconnect(); tourObs = null; }
    document.querySelectorAll(".tour-note").forEach((n) => n.remove());
    let pill = $("#tour-pill");
    if (!pill) { pill = document.createElement("button"); pill.id = "tour-pill"; pill.className = "tour-pill"; document.body.appendChild(pill);
      pill.onclick = () => { setTour(!tourOn()); tour(pill.dataset.route); }; }
    pill.dataset.route = name;
    const on = tourOn(), steps = (TOUR[name] || []).filter(([sel]) => $(sel, view));
    pill.innerHTML = `<i>?</i> Guided tour <b>${on ? "ON" : "OFF"}</b>`;
    pill.classList.toggle("off", !on);
    if (!on || !steps.length) return;
    tourObs = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("show"); tourObs.unobserve(e.target); } }), { threshold: 0.6 }) : null;
    steps.forEach(([sel, text, where], i) => {
      const n = document.createElement("div");
      n.className = "tour-note";
      n.innerHTML = `<span class="tour-n">${i + 1}/${steps.length}</span><span>${esc(text)}</span><button aria-label="Hide guided tour" title="Hide guided tour">×</button>`;
      n.querySelector("button").onclick = () => { setTour(false); tour(name); };
      const el = $(sel, view);
      if (where === "append") el.appendChild(n); else if (where === "prepend") el.insertBefore(n, el.firstChild); else el.parentNode.insertBefore(n, el);
      if (tourObs) tourObs.observe(n); else n.classList.add("show");
    });
  }

  // ---------- router ----------
  function route() {
    // Hash forms: #atlas, #atlas-mars, #field-<site-id>, #compare, #about (also accepts legacy #/field/<id>)
    let h = decodeURIComponent((location.hash || "").replace(/^#\/?/, ""));
    let r, param;
    if (h.includes("/")) [r, param] = h.split("/");
    else { const i = h.indexOf("-"); r = i < 0 ? h : h.slice(0, i); param = i < 0 ? "" : h.slice(i + 1); }
    const name = ["bridge", "atlas", "field", "compare", "discover", "about"].includes(r) ? r : "bridge";
    if (name === "atlas" && param) param = { moon: "Moon", mars: "Mars", both: "Both" }[param.toLowerCase()] || param;
    teardown();
    setChrome(name);
    view.classList.toggle("is-bridge", name === "bridge");
    window.scrollTo(0, 0);
    ({ bridge: renderBridge, atlas: renderAtlas, field: renderField, compare: renderCompare, discover: renderDiscover, about: renderAbout })[name](param || undefined);
    tour(name);
  }

  load().then(() => { window.addEventListener("hashchange", route); route(); })
    .catch((e) => { view.innerHTML = `<div class="panel card"><h3>Could not load data</h3><p class="note">${esc(e.message)}. Make sure data/bundle.js is present, or serve this folder over HTTP.</p></div>`; });
})();
