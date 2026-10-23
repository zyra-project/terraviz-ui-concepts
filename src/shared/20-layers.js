/* ==========================================================================
   SOS Catalog Concepts — layer registry
   Colormaps + legends for the procedural "data layers", planetary-body presets,
   and the 2D overlay renderers (quakes, storm tracks, routes, satellites, particles).
   NOTE: layers are illustrative visuals generated in the browser — not real data.
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;
  const { TAU, DEG, clamp, lerp, rng, gauss, hashStr, gcInterp, catmull, wrapPI } = SOS;

  /* ---------- colour parsing with alpha ---------- */
  function parseRGBA(c) {
    c = String(c).trim();
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      if (h.length === 6) h += 'ff';
      const n = parseInt(h, 16);
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].map((v, i) => (i === 3 ? v / 255 : v));
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    return [0, 0, 0, 1];
  }
  // 256-step RGBA ramp (Uint8ClampedArray, straight alpha) from [[pos, color], ...]
  function buildRamp(stops, n = 256) {
    const S = stops.map(([p, c]) => [p, parseRGBA(c)]);
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let a = S[0], b = S[S.length - 1];
      for (let k = 0; k < S.length - 1; k++) if (t >= S[k][0] && t <= S[k + 1][0]) { a = S[k]; b = S[k + 1]; break; }
      const u = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
      for (let ch = 0; ch < 4; ch++) out[i * 4 + ch] = (ch === 3 ? lerp(a[1][3], b[1][3], u) * 255 : lerp(a[1][ch], b[1][ch], u));
    }
    return out;
  }
  const opaque = (stops) => stops.map(([p, c]) => { const [r, g, b] = parseRGBA(c); return [p, `rgb(${r | 0},${g | 0},${b | 0})`]; });
  const cssGradient = (stops, dir = 'to right') => `linear-gradient(${dir}, ${opaque(stops).map(([p, c]) => `${c} ${(p * 100).toFixed(1)}%`).join(', ')})`;

  /* ---------- Earth layer registry ---------- */
  // field = shader field id (see globe engine). time.mode: season | years | frames | live
  const F = { none: 0, sst: 1, temp: 2, clouds: 3, precip: 4, aerosol: 5, co2: 6, ice: 7, bathy: 8, veg: 9, chloro: 10, pop: 11, tsunami: 12, ozone: 13, aurora: 14, magnetic: 15, insol: 16, lights: 17, topo: 18, wind: 19, currents: 20, fire: 21, acid: 22 };

  const LAYERS = {
    earth: { label: 'Blue Marble', field: F.none, accent: '#4f9dff', view: [-30, 22, 1], time: { mode: 'season' }, overlay: 'cities' },
    sst: { label: 'Sea surface temperature', field: F.sst, unit: '°C', range: [-2, 32], ticks: [0, 10, 20, 30], accent: '#f58a2b', view: [-150, 6, 1], time: { mode: 'season' },
      stops: [[0, '#2a1a8c'], [.18, '#2457d6'], [.36, '#18b0c8'], [.52, '#5bd67f'], [.68, '#f3e24a'], [.84, '#f58a2b'], [1, '#d63a2f']] },
    temp: { label: 'Temperature anomaly', field: F.temp, unit: '°C', range: [-4, 4], ticks: [-4, -2, 0, 2, 4], accent: '#ef5a4a', view: [30, 42, 1], time: { mode: 'years' }, diverging: true,
      stops: [[0, '#2b4fd1'], [.25, '#79a6f2'], [.5, '#f2f2ef'], [.75, '#f5a26a'], [1, '#c4222f']] },
    clouds: { label: 'Cloud cover', field: F.clouds, unit: '%', range: [0, 100], ticks: [0, 50, 100], accent: '#dce8ff', view: [-45, 25, 1], time: { mode: 'live' }, anim: true, noLegendGradient: true,
      stops: [[0, 'rgba(255,255,255,0)'], [1, '#ffffff']] },
    precip: { label: 'Precipitation rate', field: F.precip, unit: 'mm/hr', range: [0, 20], ticks: [0, 5, 10, 20], accent: '#35c2ff', view: [95, 12, 1], time: { mode: 'season' },
      stops: [[0, 'rgba(60,120,255,0)'], [.15, 'rgba(66,140,255,.6)'], [.4, '#2fd3c3'], [.65, '#a6e04a'], [.85, '#ffcf3a'], [1, '#ff5a2a']] },
    aerosol: { label: 'Aerosol optical depth', field: F.aerosol, unit: 'AOD', range: [0, 1.5], ticks: [0, .5, 1, 1.5], accent: '#ef8a5a', view: [5, 18, 1], time: { mode: 'season' }, anim: true,
      stops: [[0, 'rgba(255,200,120,0)'], [.3, 'rgba(255,170,90,.5)'], [.6, '#ef6a5a'], [.85, '#b83c9e'], [1, '#6c2bd9']] },
    co2: { label: 'Atmospheric CO₂', field: F.co2, unit: 'ppm', range: [380, 430], ticks: [380, 400, 420, 430], accent: '#f79a3b', view: [10, 30, 1], time: { mode: 'season' },
      stops: [[0, '#2c1b8a'], [.3, '#7d2f9c'], [.55, '#d0516e'], [.8, '#f79a3b'], [1, '#fbe45a']] },
    ice: { label: 'Sea ice concentration', field: F.ice, unit: '%', range: [0, 100], ticks: [0, 25, 50, 75, 100], accent: '#a8e6ff', view: [-20, 80, 1.1], time: { mode: 'season' },
      stops: [[0, 'rgba(150,215,255,0)'], [.2, 'rgba(160,220,255,.55)'], [.55, '#d9f2ff'], [1, '#ffffff']] },
    bathy: { label: 'Ocean depth', field: F.bathy, unit: 'm', range: [0, 6000], ticks: [0, 2000, 4000, 6000], accent: '#2ea5ff', view: [-35, 12, 1], time: { mode: 'static' }, invertTicks: false,
      stops: [[0, '#a3ecff'], [.25, '#46b6ea'], [.5, '#1f6fc0'], [.75, '#123f8c'], [1, '#07174a']] },
    veg: { label: 'Vegetation index', field: F.veg, unit: 'NDVI', range: [0, 1], ticks: [0, .25, .5, .75, 1], accent: '#6cc04a', view: [20, 8, 1], time: { mode: 'season' },
      stops: [[0, '#8a6a3a'], [.3, '#c9b96d'], [.55, '#8cc152'], [.8, '#3ea14a'], [1, '#0f6a3a']] },
    chloro: { label: 'Chlorophyll-a', field: F.chloro, unit: 'mg/m³', range: [0.01, 20], ticks: [0.01, 0.1, 1, 10], accent: '#4ade9a', view: [-25, 42, 1], time: { mode: 'season' },
      stops: [[0, '#15307f'], [.25, '#1c76b8'], [.5, '#20b8a0'], [.75, '#93dc4e'], [1, '#f2f06a']] },
    pop: { label: 'Population density', field: F.pop, unit: 'per km²', range: [0, 1000], ticks: [0, 100, 500, 1000], accent: '#ff8a3a', view: [85, 26, 1], time: { mode: 'years' }, overlay: 'cities',
      stops: [[0, 'rgba(255,220,120,0)'], [.3, 'rgba(255,190,80,.6)'], [.6, '#ff8a3a'], [.85, '#ff4a5e'], [1, '#ffe1f4']] },
    tsunami: { label: 'Maximum wave height', field: F.tsunami, unit: 'm', range: [0, 3], ticks: [0, 1, 2, 3], accent: '#ffcf3a', view: [170, 24, 1], time: { mode: 'hours' }, overlay: 'quakeSrc',
      stops: [[0, 'rgba(80,160,255,0)'], [.2, 'rgba(90,170,255,.55)'], [.45, '#5be0d8'], [.7, '#ffe45a'], [1, '#ff4a2a']] },
    ozone: { label: 'Total column ozone', field: F.ozone, unit: 'DU', range: [100, 500], ticks: [100, 220, 350, 500], accent: '#9a7bff', view: [0, -84, 1.15], time: { mode: 'season' },
      stops: [[0, '#3a0a8c'], [.25, '#3b4fd8'], [.5, '#2fb4c8'], [.75, '#7ed957'], [1, '#f5e04a']] },
    aurora: { label: 'Auroral oval intensity', field: F.aurora, unit: 'kR', range: [0, 100], ticks: [0, 25, 50, 100], accent: '#5dffb0', view: [-100, 72, 1.1], time: { mode: 'live' }, anim: true, dayNight: true,
      stops: [[0, 'rgba(0,255,150,0)'], [.4, 'rgba(60,255,160,.55)'], [.8, '#7dffb0'], [1, '#c79bff']] },
    magnetic: { label: 'Magnetic field strength', field: F.magnetic, unit: 'µT', range: [25, 65], ticks: [25, 35, 45, 55, 65], accent: '#19c3ff', view: [-70, 20, 1], time: { mode: 'years' },
      stops: [[0, '#1e3cff'], [.3, '#19c3ff'], [.5, '#3ddc84'], [.7, '#ffd23f'], [1, '#ff5a36']] },
    insol: { label: 'Solar insolation', field: F.insol, unit: 'W/m²', range: [0, 1200], ticks: [0, 400, 800, 1200], accent: '#ffcf4a', view: [0, 15, 1], time: { mode: 'season' }, dayNight: true,
      stops: [[0, 'rgba(255,230,120,0)'], [.35, 'rgba(255,210,90,.55)'], [.7, '#ffb02e'], [1, '#ff6a1a']] },
    lights: { label: 'Night lights', field: F.lights, unit: 'nW/cm²/sr', range: [0, 100], ticks: [0, 50, 100], accent: '#ffd98a', view: [-72, 36, 1], time: { mode: 'live' }, dayNight: true, sunFixed: [0.95, 0.2], noLegendGradient: true,
      stops: [[0, '#0b0f2a'], [1, '#ffe7a0']] },
    topo: { label: 'Elevation & bathymetry', field: F.topo, unit: 'm', range: [-8000, 8000], ticks: [-8000, 0, 4000, 8000], accent: '#c9a36b', view: [85, 30, 1], time: { mode: 'static' },
      stops: [[0, '#0b2a63'], [.35, '#2f7fc4'], [.5, '#bfe3c9'], [.62, '#7fb86a'], [.78, '#c2a060'], [.92, '#8a6a4a'], [1, '#ffffff']] },
    wind: { label: 'Wind speed', field: F.wind, unit: 'm/s', range: [0, 40], ticks: [0, 10, 20, 40], accent: '#9ee7ff', view: [-25, 48, 1], time: { mode: 'live' }, anim: true, particles: 'wind',
      stops: [[0, 'rgba(120,200,255,0)'], [.5, 'rgba(140,220,255,.4)'], [1, '#ffffff']] },
    currents: { label: 'Surface current speed', field: F.currents, unit: 'm/s', range: [0, 1.5], ticks: [0, .5, 1, 1.5], accent: '#5ee0e8', view: [-50, 28, 1], time: { mode: 'season' }, anim: true, particles: 'currents',
      stops: [[0, 'rgba(20,80,160,0)'], [.4, 'rgba(60,200,230,.5)'], [1, '#d4fbff']] },
    fire: { label: 'Active fire detections', field: F.fire, unit: 'MW', range: [0, 500], ticks: [0, 100, 250, 500], accent: '#ff7a2a', view: [20, -6, 1], time: { mode: 'season' }, anim: true,
      stops: [[0, '#ffe06a'], [.5, '#ff8a2a'], [1, '#e8321e']] },
    acid: { label: 'Surface ocean pH', field: F.acid, unit: 'pH', range: [7.9, 8.2], ticks: [7.9, 8.0, 8.1, 8.2], accent: '#e8923a', view: [-40, 20, 1], time: { mode: 'years' },
      stops: [[0, '#c3412f'], [.3, '#e8923a'], [.6, '#e8d36a'], [.85, '#7acb7d'], [1, '#2a8fb8']] },
    quakes: { label: 'Earthquakes & plate boundaries', field: F.none, unit: 'depth km', range: [0, 700], ticks: [0, 70, 300, 700], accent: '#ff7a59', view: [140, 18, 1], time: { mode: 'years' }, overlay: 'quakes',
      stops: [[0, '#ff5a3c'], [.1, '#ffb13c'], [.43, '#6be07a'], [1, '#4d7bff']] },
    storms: { label: 'Tropical cyclone tracks', field: F.none, unit: 'category', range: [0, 5], ticks: [0, 1, 2, 3, 4, 5], accent: '#7be0ff', view: [-70, 22, 1], time: { mode: 'season' }, overlay: 'storms',
      stops: [[0, '#5fd3ff'], [.2, '#5de0a0'], [.4, '#f5e04a'], [.6, '#ffa73a'], [.8, '#ff5a3a'], [1, '#e83ac0']] },
    routes: { label: 'Tracks & routes', field: F.none, unit: '', accent: '#6be0ff', view: [-20, 38, 1], time: { mode: 'season' }, overlay: 'routes', noLegendGradient: true, stops: [[0, '#6be0ff'], [1, '#ffffff']] },
    energy: { label: 'Energy infrastructure', field: F.none, unit: '', accent: '#ffcf3a', view: [15, 42, 1], time: { mode: 'years' }, overlay: 'energy', categorical: true,
      stops: [[0, '#ffcf3a'], [1, '#4aa8ff']] },
  };
  for (const k of Object.keys(LAYERS)) { LAYERS[k].id = k; if (!LAYERS[k].overlay) LAYERS[k].overlay = 'none'; }

  /* ---------- planetary bodies / skies (shader family ids) ---------- */
  // fam: 1 rock, 2 mars, 3 venus, 4 gas, 5 icy, 6 io, 7 titan, 8 sun, 9 exo, 10 cmb, 11 milky
  // P = [craters, dichotomy/bands, contrast, storm/aux]
  const B = (fam, a, b, c, P, extra) => Object.assign({ fam, a, b, c, P }, extra || {});
  const BODIES = {
    moon: B(1, '#cfccc6', '#6f6c69', '#9d9a94', [1.0, 0, 1, 0], { label: 'Moon', accent: '#cfccc6' }),
    mercury: B(1, '#a9a39b', '#5b5651', '#8b857d', [1.35, 0, .6, 0], { label: 'Mercury', accent: '#a9a39b' }),
    phobos: B(1, '#8c837b', '#4d4742', '#6f6760', [1.8, 0, .6, 0], { label: 'Phobos', accent: '#8c837b' }),
    deimos: B(1, '#9a9086', '#5e564e', '#7a7068', [0.8, 0, .4, 0], { label: 'Deimos', accent: '#9a9086' }),
    comet: B(1, '#46423f', '#1d1b1a', '#2e2b29', [0.6, 0, .8, 0], { label: 'Comet 67P', accent: '#8b857d' }),
    ceres: B(1, '#9a9794', '#54514f', '#77746f', [1.2, 0, .6, 1], { label: 'Ceres', accent: '#9a9794' }),
    vesta: B(1, '#b3aca1', '#6d665d', '#8f887d', [1.1, 0, .7, 0], { label: 'Vesta', accent: '#b3aca1' }),
    callisto: B(1, '#6a5f56', '#352e29', '#4d443d', [1.7, 0, .8, 1], { label: 'Callisto', accent: '#8a7b6d' }),
    ganymede: B(1, '#9a928a', '#554d46', '#756d65', [1.0, 0, 1, 1], { label: 'Ganymede', accent: '#9a928a' }),
    mimas: B(1, '#c9c9c9', '#8c8c8c', '#a9a9a9', [1.5, 0, .6, 0], { label: 'Mimas', accent: '#c9c9c9' }),
    tethys: B(1, '#dedcd8', '#9f9d99', '#bebcb8', [1.1, 0, .5, 0], { label: 'Tethys', accent: '#dedcd8' }),
    dione: B(1, '#d6d4d0', '#8e8c88', '#b3b1ad', [1.0, 0, .6, 0], { label: 'Dione', accent: '#d6d4d0' }),
    rhea: B(1, '#cfcdc9', '#8a8884', '#aeaca8', [1.3, 0, .6, 0], { label: 'Rhea', accent: '#cfcdc9' }),
    iapetus: B(1, '#ddd8cf', '#2c2622', '#8d8780', [0.9, 1, 1, 0], { label: 'Iapetus', accent: '#ddd8cf' }),
    phoebe: B(1, '#5d5b59', '#2b2a29', '#454342', [1.6, 0, .7, 0], { label: 'Phoebe', accent: '#8c8a88' }),
    miranda: B(1, '#b0aea9', '#6c6a66', '#8e8c87', [0.9, 0, .9, 0], { label: 'Miranda', accent: '#b0aea9' }),
    ariel: B(1, '#bdbab4', '#77746f', '#9b9893', [0.8, 0, .6, 0], { label: 'Ariel', accent: '#bdbab4' }),
    umbriel: B(1, '#6e6c69', '#3b3a38', '#535250', [1.0, 0, .6, 0], { label: 'Umbriel', accent: '#8d8b88' }),
    titania: B(1, '#a29c94', '#625d56', '#827c75', [0.9, 0, .7, 0], { label: 'Titania', accent: '#a29c94' }),
    oberon: B(1, '#8c857d', '#4a4540', '#6a645d', [1.1, 0, .7, 0], { label: 'Oberon', accent: '#8c857d' }),
    charon: B(1, '#9c9690', '#5d3c33', '#7b756e', [0.9, 0, .8, 2], { label: 'Charon', accent: '#9c9690' }),
    mars: B(2, '#b9623a', '#4d3a31', '#eadfd2', [0.7, 0, 1, 0], { label: 'Mars', accent: '#d9794a' }),
    venus: B(3, '#e6b86e', '#c78c47', '#f6e2b4', [0, 0, 1, 0], { label: 'Venus', accent: '#efc176' }),
    jupiter: B(4, '#d9b48e', '#8f5b3a', '#eee0cb', [0, 1, 1, 1], { label: 'Jupiter', accent: '#d9b48e' }),
    saturn: B(4, '#ecd9a7', '#b88f55', '#f6eccf', [0, .7, .6, 0], { label: 'Saturn', accent: '#ecd9a7' }),
    uranus: B(4, '#a9e1e2', '#7ac9d0', '#cdf1f1', [0, .35, .25, 0], { label: 'Uranus', accent: '#a9e1e2' }),
    neptune: B(4, '#3f62dc', '#2339aa', '#86a7ff', [0, .5, .6, 2], { label: 'Neptune', accent: '#5a7dff' }),
    sun: B(8, '#ff8a1a', '#ffd27a', '#7a1e00', [0, 0, 1, 0], { label: 'Sun', accent: '#ffb347' }),
    io: B(6, '#e8d66a', '#c4762b', '#2a2420', [0, 0, 1, 0], { label: 'Io', accent: '#e8d66a' }),
    europa: B(5, '#ece6da', '#b4784f', '#9fb7c9', [0, 0, 1, 0], { label: 'Europa', accent: '#ece6da' }),
    enceladus: B(5, '#f6f8fb', '#d7e5f1', '#7fb4d6', [0, 1, 1, 0], { label: 'Enceladus', accent: '#f6f8fb' }),
    triton: B(5, '#e8d9d1', '#b98f88', '#c8e0e8', [0, 0, 1, 1], { label: 'Triton', accent: '#e8d9d1' }),
    pluto: B(5, '#d9c3a5', '#8d5b46', '#f3ece0', [0, 0, 1, 2], { label: 'Pluto', accent: '#d9c3a5' }),
    titan: B(7, '#d99b4a', '#b9722a', '#efc27a', [0, 0, 1, 0], { label: 'Titan', accent: '#e0a357' }),
    exo: B(9, '#4a7fd0', '#2c5a9a', '#9fd0ff', [0, 0, 1, 0], { label: 'Exoplanet', accent: '#7aa7ff' }),
  };
  const SKIES = {
    cmb: { fam: 10, a: '#2a52ff', b: '#f4f1ea', c: '#ff4a2a', P: [0, 0, 1, 0], label: 'Cosmic microwave background', accent: '#ff7a4a' },
    milky: { fam: 11, a: '#05060d', b: '#c9b8ff', c: '#ffd9a0', P: [0, 0, 1, 0], label: 'All-sky panorama', accent: '#c9b8ff' },
  };
  const EXO_PALETTES = [
    ['#c9744a', '#6b3a2a', '#f0c9a4'], ['#4a7fd0', '#1f3f78', '#cfe4ff'], ['#7aa95a', '#3d5e2f', '#cfe6b8'],
    ['#d9b36a', '#8a6a35', '#f5e4b8'], ['#8a5ad0', '#4a2f78', '#e0cfff'], ['#e0583a', '#6e1e12', '#ffd2a0'],
  ];

  /* ---------- resolve a dataset → layer definition ---------- */
  function resolve(d) {
    const kind = (d && d.kind) || 'earth';
    if (kind.startsWith('body:')) {
      const key = kind.slice(5);
      let b = BODIES[key] || BODIES.moon;
      let variant = null;
      const name = d.name.toLowerCase();
      if (key === 'sun') {
        variant = /304|helium/.test(name) ? 'red' : /171/.test(name) ? 'gold' : /193|iron/.test(name) ? 'green' : /x-ray/.test(name) ? 'xray' : 'orange';
      }
      let colors = [b.a, b.b, b.c];
      if (key === 'exo') { const pal = EXO_PALETTES[hashStr(d.name) % EXO_PALETTES.length]; colors = pal; }
      if (key === 'sun') {
        colors = { red: ['#ff3a1a', '#ffa05a', '#4a0800'], gold: ['#f2b53a', '#fff0a0', '#6a3a00'], green: ['#6fbf8a', '#d6ffd0', '#0a3a28'], xray: ['#30303a', '#ffffff', '#000000'], orange: [b.a, b.b, b.c] }[variant];
      }
      return { id: 'body', kind: 'body', key, space: true, fam: b.fam, colors, P: b.P, label: b.label, accent: b.accent, view: [0, 8, 1], seed: hashStr(d.name) % 997, variant, field: 0, overlay: 'none', time: { mode: 'live' }, anim: true };
    }
    if (kind.startsWith('sky:')) {
      const s = SKIES[kind.slice(4)];
      return { id: 'sky', kind: 'sky', key: kind.slice(4), space: true, fam: s.fam, colors: [s.a, s.b, s.c], P: s.P, label: s.label, accent: s.accent, view: [0, 12, 1], seed: hashStr(d.name) % 997, field: 0, overlay: 'none', time: { mode: 'live' }, anim: false };
    }
    const L = LAYERS[kind] || LAYERS.earth;
    return Object.assign({ kind }, L, { seed: hashStr(d.name) % 997 });
  }

  /* ---------- time info (what the timeline scrubs) ---------- */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function timeInfo(d, layer) {
    layer = layer || resolve(d);
    if (d.t0 && d.t1) {
      const a = Date.parse(d.t0 + 'T00:00:00Z'), b = Date.parse(d.t1 + 'T00:00:00Z');
      const spanY = (b - a) / 31557600000;
      const label = (t) => {
        const ms = a + (b - a) * t;
        const dt = new Date(ms);
        if (spanY > 12) return String(dt.getUTCFullYear());
        if (spanY > 0.9) return MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
        return dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
      };
      return { has: true, start: label(0), end: label(1), label, kind: 'range', loop: clamp(8 + Math.min(spanY, 200) * 0.08, 8, 24) };
    }
    const mode = (layer.time && layer.time.mode) || 'season';
    if (mode === 'static') return { has: false, label: () => '', start: '', end: '', kind: 'static', loop: 12 };
    if (mode === 'season') return { has: true, start: 'Jan', end: 'Dec', label: (t) => MONTHS[Math.min(11, Math.floor(t * 12))], kind: 'season', loop: 14 };
    if (mode === 'years') return { has: true, start: '2015', end: '2100', label: (t) => String(Math.round(2015 + t * 85)), kind: 'years', loop: 16 };
    if (mode === 'hours') return { has: true, start: '0 h', end: '24 h', label: (t) => Math.round(t * 24) + ' h', kind: 'hours', loop: 12 };
    return { has: true, start: 'Now −24 h', end: 'Now', label: (t) => (t > 0.98 ? 'Now' : '−' + Math.round((1 - t) * 24) + ' h'), kind: 'live', loop: 12 };
  }

  /* ---------- land mask on the CPU (for particles, random tracks) ---------- */
  const land = { w: 0, h: 0, data: null, ready: false, waiters: [] };
  function initLandMask() {
    if (!window.SOS_ASSETS || land.data) return;
    const img = new Image();
    img.onload = () => {
      const w = 1024, h = 512;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, w, h);
      const px = x.getImageData(0, 0, w, h).data;
      land.w = w; land.h = h; land.data = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) land.data[i] = px[i * 4] < 101 ? 1 : 0; // dark = land
      // Antarctica fill (mask has no data south of ~85°S)
      for (let y = Math.floor(h * (1 - 5 / 180)); y < h; y++) for (let xx = 0; xx < w; xx++) land.data[y * w + xx] = 1;
      land.ready = true;
      land.waiters.splice(0).forEach((fn) => fn());
    };
    img.src = SOS_ASSETS.mask;
  }
  function isLand(lon, lat) {
    if (!land.ready) return false;
    let x = Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * land.w);
    const y = clamp(Math.floor((90 - lat) / 180 * land.h), 0, land.h - 1);
    if (x >= land.w) x = land.w - 1;
    return land.data[y * land.w + x] === 1;
  }
  const whenLand = (fn) => (land.ready ? fn() : land.waiters.push(fn));
  initLandMask();

  /* ======================================================================
     Overlays — canvas 2D renderers drawn above the globe.
     Interface: { draw(ctx, view, t, time) } where view = {w,h,dpr,project(lon,lat)->[x,y,vis],scale,accent,flat}
     ====================================================================== */
  const DEPTH_STOPS = [[0, '#ff5a3c'], [.1, '#ffb13c'], [.43, '#6be07a'], [1, '#4d7bff']];
  const depthRamp = buildRamp(DEPTH_STOPS, 64);
  const depthColor = (km, a = 1) => { const i = clamp(Math.round((km / 700) * 63), 0, 63) * 4; return `rgba(${depthRamp[i]},${depthRamp[i + 1]},${depthRamp[i + 2]},${a})`; };
  const catRamp = buildRamp(LAYERS.storms.stops, 64);
  const catColor = (v, a = 1) => { const i = clamp(Math.round(v * 63), 0, 63) * 4; return `rgba(${catRamp[i]},${catRamp[i + 1]},${catRamp[i + 2]},${a})`; };
  const PLATE_COLORS = { trench: '#ff7a59', ridge: '#59d6ff', transform: '#ffd34d', collision: '#e26bff', rift: '#6be07a' };

  function strokePolyline(ctx, view, pts, closeGap = 0.45) {
    let prev = null, began = false;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = view.project(pts[i][0], pts[i][1]);
      const vis = p[2] > 0.02;
      if (vis && prev && prev[2] > 0.02 && Math.abs(p[0] - prev[0]) < view.w * closeGap && Math.abs(p[1] - prev[1]) < view.h * closeGap) ctx.lineTo(p[0], p[1]);
      else if (vis) ctx.moveTo(p[0], p[1]);
      prev = p; began = true;
    }
    return began;
  }

  const overlays = {};
  overlays.none = () => null;

  overlays.cities = function (opts = {}) {
    const list = SOS.geo.CITIES.slice().sort((a, b) => b.pop - a.pop);
    const lightsMode = !!opts.lights;
    return {
      draw(ctx, view) {
        const z = view.zoom;
        const maxN = z < 1.15 ? 0 : z < 1.6 ? 14 : z < 2.3 ? 30 : 80;
        if (!maxN) return;
        ctx.save();
        ctx.font = `${Math.round(11 * view.dpr)}px ${view.font || 'system-ui, sans-serif'}`;
        ctx.textBaseline = 'middle';
        const boxes = [];
        let n = 0;
        for (const c of list) {
          if (n >= maxN) break;
          const p = view.project(c.lon, c.lat);
          if (p[2] < 0.35) continue;
          const tw = ctx.measureText(c.name).width;
          const bx = { x: p[0] + 7 * view.dpr, y: p[1] - 8 * view.dpr, w: tw + 4, h: 16 * view.dpr };
          if (boxes.some((b) => bx.x < b.x + b.w && bx.x + bx.w > b.x && bx.y < b.y + b.h && bx.y + bx.h > b.y)) continue;
          boxes.push(bx); n++;
          ctx.globalAlpha = clamp(p[2] * 1.4, 0, 1);
          ctx.fillStyle = view.accent || '#fff';
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.2 * view.dpr, 0, TAU); ctx.fill();
          ctx.lineWidth = 3 * view.dpr; ctx.strokeStyle = view.halo || 'rgba(0,0,0,.55)'; ctx.lineJoin = 'round';
          ctx.strokeText(c.name, bx.x, p[1]);
          ctx.fillStyle = view.text || '#fff';
          ctx.fillText(c.name, bx.x, p[1]);
        }
        ctx.restore();
      },
    };
  };

  overlays.plates = function () {
    return {
      draw(ctx, view) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of SOS.geo.PLATES) {
          const pts = catmull(p.pts, 6);
          ctx.strokeStyle = PLATE_COLORS[p.kind] || '#fff';
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.6 * view.dpr;
          if (strokePolyline(ctx, view, pts)) ctx.stroke();
        }
        ctx.restore();
      },
    };
  };

  overlays.quakes = function (seedKey) {
    const R = rng(hashStr(String(seedKey || 'q')) + 11);
    const plates = SOS.geo.PLATES.map((p) => ({ p, pts: catmull(p.pts, 6) }));
    const lens = plates.map(({ pts }) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; });
    const totalLen = lens.reduce((a, b) => a + b, 0);
    const events = [];
    const N = 520;
    for (let i = 0; i < N; i++) {
      let r = R() * totalLen, k = 0;
      while (k < lens.length - 1 && r > lens[k]) { r -= lens[k]; k++; }
      const { p, pts } = plates[k];
      const idx = Math.min(pts.length - 2, Math.floor((r / lens[k]) * (pts.length - 1)));
      const u = R();
      const lon = lerp(pts[idx][0], pts[idx + 1][0], u) + gauss(R) * (p.kind === 'ridge' ? 0.6 : 1.3);
      const lat = clamp(lerp(pts[idx][1], pts[idx + 1][1], u) + gauss(R) * (p.kind === 'ridge' ? 0.6 : 1.3), -85, 85);
      const mag = clamp(4.4 + -Math.log10(Math.max(1e-6, R())) * 1.05, 4.4, 9.1);
      let depth = p.kind === 'ridge' || p.kind === 'rift' ? 5 + R() * 25 : p.kind === 'transform' ? 4 + R() * 18 : p.kind === 'trench' ? Math.pow(R(), 1.8) * 640 + 8 : Math.pow(R(), 1.6) * 260 + 10;
      events.push({ lon, lat, mag, depth, at: R() });
    }
    events.sort((a, b) => a.at - b.at);
    const withPlates = overlays.plates();
    return {
      draw(ctx, view, t, time) {
        withPlates.draw(ctx, view);
        ctx.save();
        for (const e of events) {
          const age = t - e.at;
          if (age < 0) continue;
          const p = view.project(e.lon, e.lat);
          if (p[2] < 0.05) continue;
          const base = (1.2 + Math.pow(1.62, e.mag - 4) * 0.62) * view.dpr * Math.min(1.5, 0.75 + view.zoom * 0.28);
          const fade = clamp(1 - age * 1.1, 0.35, 1);
          const pulse = age < 0.05 ? 1 - age / 0.05 : 0;
          ctx.globalAlpha = p[2] * fade;
          ctx.fillStyle = depthColor(e.depth, 0.78);
          ctx.beginPath(); ctx.arc(p[0], p[1], base * (age < 0.02 ? 0.4 + age / 0.02 * 0.6 : 1), 0, TAU); ctx.fill();
          ctx.lineWidth = 1 * view.dpr; ctx.strokeStyle = depthColor(e.depth, 0.95); ctx.stroke();
          if (pulse > 0) {
            ctx.globalAlpha = p[2] * pulse * 0.8; ctx.lineWidth = 1.5 * view.dpr;
            ctx.beginPath(); ctx.arc(p[0], p[1], base + (1 - pulse) * 26 * view.dpr, 0, TAU); ctx.stroke();
          }
        }
        ctx.restore();
      },
    };
  };

  overlays.quakeSrc = function (src = [142.37, 38.3]) {
    return {
      draw(ctx, view, t, time) {
        const p = view.project(src[0], src[1]);
        if (p[2] < 0.05) return;
        ctx.save();
        const pulse = (time * 0.8) % 1;
        ctx.strokeStyle = '#ffd34d'; ctx.fillStyle = '#ffd34d';
        ctx.globalAlpha = p[2];
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.5 * view.dpr, 0, TAU); ctx.fill();
        ctx.globalAlpha = p[2] * (1 - pulse);
        ctx.lineWidth = 1.5 * view.dpr;
        ctx.beginPath(); ctx.arc(p[0], p[1], (4 + pulse * 22) * view.dpr, 0, TAU); ctx.stroke();
        ctx.restore();
      },
    };
  };

  overlays.storms = function (seedKey) {
    const R = rng(hashStr(String(seedKey || 's')) + 5);
    const tracks = SOS.geo.STORM_TRACKS.map((s, i) => {
      const pts = catmull(s.pts, 10);
      const peak = 0.35 + R() * 0.65;
      return { pts, peak, offset: R(), speed: 0.8 + R() * 0.5, name: s.name };
    });
    return {
      draw(ctx, view, t, time) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const tr of tracks) {
          const n = tr.pts.length;
          const prog = ((t * tr.speed + tr.offset) % 1);
          const head = Math.floor(prog * (n - 1));
          // draw the path travelled so far, coloured by (illustrative) intensity
          let prev = null;
          for (let i = 0; i <= head; i++) {
            const p = view.project(tr.pts[i][0], tr.pts[i][1]);
            const k = i / (n - 1);
            const inten = Math.sin(Math.PI * clamp(k * 1.05, 0, 1)) * tr.peak;
            if (prev && prev[2] > 0.02 && p[2] > 0.02 && Math.abs(p[0] - prev[0]) < view.w * 0.4) {
              ctx.strokeStyle = catColor(inten, clamp(0.25 + k * 0.7, 0, 0.95) * Math.min(prev[2], p[2]));
              ctx.lineWidth = (1.4 + inten * 2.4) * view.dpr;
              ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
            }
            prev = p;
          }
          // faint remaining track
          ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.setLineDash([2 * view.dpr, 5 * view.dpr]); ctx.lineWidth = 1 * view.dpr;
          if (strokePolyline(ctx, view, tr.pts.slice(head))) ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          // storm head: rotating spiral
          const hp = view.project(tr.pts[head][0], tr.pts[head][1]);
          if (hp[2] > 0.1) {
            const k = head / (n - 1);
            const inten = Math.sin(Math.PI * clamp(k * 1.05, 0, 1)) * tr.peak;
            const r = (5 + inten * 9) * view.dpr * Math.min(1.6, 0.8 + view.zoom * 0.25);
            ctx.save(); ctx.translate(hp[0], hp[1]); ctx.globalAlpha = hp[2];
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
            g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
            ctx.rotate(-time * 2.2);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * view.dpr;
            for (let arm = 0; arm < 2; arm++) {
              ctx.beginPath();
              for (let a = 0; a < 3.3; a += 0.2) { const rr = r * (0.15 + a / 3.3 * 0.85); const ang = a + arm * Math.PI; ctx[a === 0 ? 'moveTo' : 'lineTo'](Math.cos(ang) * rr, Math.sin(ang) * rr); }
              ctx.stroke();
            }
            ctx.fillStyle = catColor(inten); ctx.beginPath(); ctx.arc(0, 0, 2.6 * view.dpr, 0, TAU); ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
      },
    };
  };

  // sea lanes with waypoints (so shipping avoids crossing land)
  const SEA_LANES = [
    [[121.5, 31], [130, 30], [150, 36], [-170, 40], [-140, 36], [-122, 33.5]], // Shanghai → LA
    [[121.5, 31], [114, 22], [104, 8], [103.8, 1.3], [98, 5], [80, 6], [60, 14], [44, 12.5], [34, 27], [32.5, 31], [20, 35], [5, 37], [-6, 36], [-9.5, 38.5], [-5, 48], [4, 52]], // Asia → N. Europe via Suez
    [[4, 52], [-10, 50], [-30, 46], [-55, 42], [-74, 40]], // Rotterdam → New York
    [[-74, 40], [-76, 30], [-80, 25], [-84, 23], [-79.5, 9]], // NY → Panama
    [[-79.5, 9], [-90, 6], [-110, 14], [-125, 24], [-140, 30], [-158, 21], [-175, 28], [160, 33], [140, 35]], // Panama → Japan
    [[4, 52], [-10, 46], [-17, 28], [-17, 15], [-5, 3], [8, -10], [14, -25], [18.5, -34], [27, -34], [40, -26], [55, -22]], // Europe → Cape
    [[103.8, 1.3], [112, -8], [120, -12], [135, -20], [151, -34]], // Singapore → Sydney
    [[-43, -23], [-30, -20], [-10, -12], [8, -8], [14, -22], [18.5, -34]], // Brazil → S. Africa
    [[-43, -23], [-35, -5], [-40, 8], [-60, 12], [-76, 20], [-85, 27]], // Brazil → Gulf
    [[56, 26], [60, 20], [70, 15], [80, 8], [93, 6], [103.8, 1.3]], // Gulf → Singapore
  ];

  overlays.routes = function (variant, seedKey) {
    const R = rng(hashStr(String(seedKey || 'r')) + 3);
    variant = variant || 'air';
    const cities = SOS.geo.CITIES.filter((c) => c.pop > 2.5);
    const arcs = [];
    if (variant === 'ship') {
      SEA_LANES.forEach((l) => arcs.push({ pts: catmull(l, 8), speed: 0.06 + R() * 0.05, w: 1.4, col: [110, 225, 255] }));
    } else if (variant === 'animal') {
      SOS.geo.MIGRATION_ARCS.forEach((l, i) => arcs.push({ pts: catmull(l, 10), speed: 0.05 + R() * 0.05, w: 1.6, col: [[255, 214, 90], [120, 240, 200], [255, 140, 200]][i % 3] }));
    } else {
      for (let i = 0; i < 70; i++) {
        const a = cities[Math.floor(R() * cities.length)], b = cities[Math.floor(R() * cities.length)];
        if (a === b) continue;
        const d = SOS.gcDistance([a.lon, a.lat], [b.lon, b.lat]);
        if (d < 0.35) continue;
        arcs.push({ pts: gcInterp([a.lon, a.lat], [b.lon, b.lat], Math.max(12, Math.round(d * 28))), speed: 0.05 + R() * 0.1, w: 1, col: [255, 255, 255], off: R() });
      }
    }
    return {
      draw(ctx, view, t, time) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const baseA = variant === 'air' ? 0.22 : 0.5;
        for (const a of arcs) {
          ctx.strokeStyle = `rgba(${a.col[0]},${a.col[1]},${a.col[2]},${baseA})`;
          ctx.lineWidth = a.w * view.dpr;
          if (strokePolyline(ctx, view, a.pts)) ctx.stroke();
          const prog = ((time * a.speed) + (a.off || 0)) % 1;
          const n = a.pts.length - 1;
          const i = Math.floor(prog * n);
          const p = view.project(a.pts[i][0], a.pts[i][1]);
          if (p[2] > 0.1) {
            ctx.globalAlpha = p[2];
            ctx.fillStyle = `rgb(${a.col[0]},${a.col[1]},${a.col[2]})`;
            ctx.shadowColor = `rgba(${a.col[0]},${a.col[1]},${a.col[2]},.9)`; ctx.shadowBlur = 6 * view.dpr;
            ctx.beginPath(); ctx.arc(p[0], p[1], (variant === 'air' ? 1.5 : 2.4) * view.dpr, 0, TAU); ctx.fill();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      },
    };
  };

  overlays.satellites = function () {
    const sats = [
      { inc: 98.6, period: 101, lon0: 20, col: '#6be0ff', n: 'NOAA polar', alt: 0.0 },
      { inc: 51.6, period: 92, lon0: -70, col: '#ffd34d', n: 'ISS', alt: 0 },
      { inc: 98.2, period: 99, lon0: 140, col: '#c79bff', n: 'JPSS', alt: 0 },
      { inc: 82, period: 110, lon0: -120, col: '#8bf0b4', n: 'Orbit', alt: 0 },
    ];
    const geo = [{ lon: -75, n: 'GOES-East', col: '#ff8a5a' }, { lon: -137, n: 'GOES-West', col: '#ff8a5a' }, { lon: 0.0, n: 'Meteosat', col: '#ff8a5a' }, { lon: 140, n: 'Himawari', col: '#ff8a5a' }];
    const track = (s, phase, N = 180) => {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const u = phase + (i / N) * 1.15;
        const th = u * TAU;
        const lat = Math.asin(Math.sin(s.inc * DEG) * Math.sin(th)) / DEG;
        const lonIn = Math.atan2(Math.cos(s.inc * DEG) * Math.sin(th), Math.cos(th)) / DEG;
        pts.push([((lonIn - u * (s.period / 1436) * 360 * 1 + s.lon0 + 540) % 360) - 180, lat]);
      }
      return pts;
    };
    return {
      draw(ctx, view, t, time) {
        ctx.save(); ctx.lineCap = 'round';
        sats.forEach((s, i) => {
          const phase = (time * 0.012 * (100 / s.period) + i * 0.21) % 1;
          const pts = track(s, phase);
          ctx.strokeStyle = s.col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2 * view.dpr; ctx.setLineDash([4 * view.dpr, 5 * view.dpr]);
          if (strokePolyline(ctx, view, pts.slice(0, 120))) ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          const p = view.project(pts[0][0], pts[0][1]);
          if (p[2] > 0.05) {
            ctx.globalAlpha = p[2]; ctx.fillStyle = s.col; ctx.shadowColor = s.col; ctx.shadowBlur = 10 * view.dpr;
            ctx.beginPath(); ctx.arc(p[0], p[1], 3.4 * view.dpr, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
            ctx.font = `${Math.round(10.5 * view.dpr)}px ${view.font || 'system-ui'}`; ctx.fillStyle = view.text || '#fff'; ctx.textBaseline = 'middle';
            ctx.fillText(s.n, p[0] + 8 * view.dpr, p[1]); ctx.globalAlpha = 1;
          }
        });
        geo.forEach((g) => {
          const p = view.project(g.lon, 0);
          if (p[2] < 0.1) return;
          ctx.globalAlpha = p[2]; ctx.strokeStyle = g.col; ctx.lineWidth = 1.4 * view.dpr;
          ctx.strokeRect(p[0] - 3.5 * view.dpr, p[1] - 3.5 * view.dpr, 7 * view.dpr, 7 * view.dpr);
          ctx.fillStyle = view.text || '#fff'; ctx.font = `${Math.round(10 * view.dpr)}px ${view.font || 'system-ui'}`; ctx.textBaseline = 'middle';
          ctx.fillText(g.n, p[0] + 9 * view.dpr, p[1]); ctx.globalAlpha = 1;
        });
        ctx.restore();
      },
    };
  };

  overlays.energy = function (seedKey) {
    const R = rng(hashStr(String(seedKey || 'e')) + 7);
    const clusters = [ // lon, lat, spread, type, weight   (0 coal, 1 solar, 2 wind, 3 hydro, 4 nuclear, 5 gas/oil)
      [-100, 41, 7, 2, 40], [-112, 35, 5, 1, 20], [-96, 30, 4, 5, 25], [-82, 40, 4, 0, 18], [-120, 38, 3, 1, 12], [-72, 45, 5, 3, 14],
      [4, 54, 4, 2, 30], [10, 51, 5, 0, 14], [2, 47, 4, 4, 22], [-4, 39, 4, 1, 16], [35, 60, 8, 5, 18],
      [112, 36, 7, 0, 50], [100, 40, 7, 1, 40], [90, 32, 8, 3, 20], [117, 30, 5, 3, 20], [78, 26, 6, 1, 28], [82, 22, 5, 0, 26],
      [50, 27, 6, 5, 36], [28, -26, 4, 0, 14], [-50, -8, 7, 3, 22], [-70, -30, 4, 1, 10], [135, 35, 4, 4, 14], [145, -32, 6, 1, 12],
      [8, 5, 4, 5, 12], [127, 37, 2, 4, 8],
    ];
    const totalW = clusters.reduce((a, c) => a + c[4], 0);
    const pts = [];
    for (let i = 0; i < 560; i++) {
      let r = R() * totalW, k = 0;
      while (k < clusters.length - 1 && r > clusters[k][4]) { r -= clusters[k][4]; k++; }
      const c = clusters[k];
      const lon = c[0] + gauss(R) * c[2], lat = clamp(c[1] + gauss(R) * c[2] * 0.7, -80, 80);
      pts.push({ lon, lat, type: R() < 0.2 ? Math.floor(R() * 6) : c[3], mw: Math.pow(R(), 2.2) });
    }
    const COL = ['#a8a39b', '#ffd23f', '#6be0ff', '#4a8bff', '#c79bff', '#ff8a5a'];
    return {
      draw(ctx, view, t, time) {
        ctx.save();
        const years = t; // newer capacity appears with time
        for (const p of pts) {
          if (p.mw > 0.2 + years * 0.8 + 0.2) continue;
          const q = view.project(p.lon, p.lat);
          if (q[2] < 0.08) continue;
          const tw = 0.7 + 0.3 * Math.sin(time * 2 + p.lon * 3);
          ctx.globalAlpha = q[2] * 0.85 * tw;
          ctx.fillStyle = COL[p.type];
          const r = (1.6 + p.mw * 4.2) * view.dpr * Math.min(1.6, 0.8 + view.zoom * 0.25);
          ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, TAU); ctx.fill();
        }
        ctx.restore();
      },
    };
  };

  /* ---------- flow particles (wind / ocean currents) ---------- */
  function Particles(type, seedKey) {
    const R = rng(hashStr(String(seedKey || 'p')) + 17);
    const N = type === 'wind' ? 1700 : 1300;
    const K = 7; // trail length
    const P = [];
    const spawn = (p) => {
      for (let tries = 0; tries < 12; tries++) {
        p.lon = R() * 360 - 180; p.lat = Math.asin(R() * 2 - 1) / DEG;
        if (type === 'wind' || !isLand(p.lon, p.lat)) break;
      }
      p.age = Math.floor(R() * 80); p.max = 70 + Math.floor(R() * 90);
      p.tr = []; for (let i = 0; i < K; i++) p.tr.push([p.lon, p.lat]);
    };
    for (let i = 0; i < N; i++) { const p = {}; spawn(p); P.push(p); }
    const gyres = [ // lon, lat, strength (+ clockwise in N hemisphere)
      [-45, 30, 1], [-150, 32, 1], [-20, -30, -1], [-110, -28, -1], [80, -30, -1], [145, 12, 0.6], [-50, 8, 0.5],
    ];
    function flow(lon, lat, time) {
      if (type === 'wind') {
        const phi = lat * DEG;
        let u = -Math.cos(3 * phi) * 7.5 + (Math.abs(lat) > 28 && Math.abs(lat) < 62 ? 3.5 : 0);
        let v = 2.4 * Math.sin(lon * DEG * 3 + time * 0.2) * Math.cos(phi * 2) + 1.6 * Math.sin(lon * DEG * 7 - lat * DEG * 4 + time * 0.1);
        return [u, v];
      }
      let u = 0, v = 0;
      for (const g of gyres) {
        const dx = (wrapPI((lon - g[0]) * DEG)) / DEG, dy = lat - g[1];
        const r2 = (dx * dx) / 380 + (dy * dy) / 170;
        const w = Math.exp(-r2) * g[2];
        u += dy * 0.11 * w; v += -dx * 0.07 * w;
      }
      // equatorial currents + circumpolar current + western boundary jets
      u += -0.9 * Math.exp(-(lat * lat) / 70) + 1.5 * Math.exp(-((lat + 54) * (lat + 54)) / 40);
      v += 0.9 * Math.exp(-((lon + 76) * (lon + 76)) / 18 - ((lat - 32) * (lat - 32)) / 90) + 0.7 * Math.exp(-((lon - 135) * (lon - 135)) / 22 - ((lat - 30) * (lat - 30)) / 70);
      return [u, v];
    }
    return {
      step(dt, time) {
        const sp = type === 'wind' ? 0.9 : 1.4;
        for (const p of P) {
          const [u, v] = flow(p.lon, p.lat, time);
          const cl = Math.max(0.25, Math.cos(p.lat * DEG));
          p.lon += (u * sp * dt * 3) / cl;
          p.lat += v * sp * dt * 3;
          if (p.lon > 180) p.lon -= 360; else if (p.lon < -180) p.lon += 360;
          p.age++;
          if (p.age > p.max || Math.abs(p.lat) > 86 || (type === 'currents' && isLand(p.lon, p.lat))) spawn(p);
          else { p.tr.pop(); p.tr.unshift([p.lon, p.lat]); }
        }
      },
      draw(ctx, view, t, time) {
        ctx.save(); ctx.lineCap = 'round';
        const col = type === 'wind' ? '200,236,255' : '140,240,255';
        for (let k = 0; k < K - 1; k++) {
          ctx.beginPath();
          for (const p of P) {
            const a = p.tr[k], b = p.tr[k + 1];
            if (Math.abs(a[0] - b[0]) > 90) continue;
            const pa = view.project(a[0], a[1]), pb = view.project(b[0], b[1]);
            if (pa[2] < 0.05 || pb[2] < 0.05) continue;
            ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
          }
          const fade = 1 - k / (K - 1);
          ctx.strokeStyle = `rgba(${col},${(0.65 * fade * fade).toFixed(3)})`;
          ctx.lineWidth = (1.2 + fade * 0.6) * view.dpr;
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  /* ---------- build the overlay stack for a dataset ---------- */
  function overlayFor(d, layer) {
    layer = layer || resolve(d);
    const stack = [];
    const name = d.name.toLowerCase();
    const seed = d.slug;
    switch (layer.overlay) {
      case 'quakes': stack.push(overlays.quakes(seed)); break;
      case 'quakeSrc': { const src = /sumatra|indian ocean/.test(name) ? [95.9, 3.3] : /chile/.test(name) ? [-72.7, -36.1] : /alaska/.test(name) ? [-147.3, 61] : /aleutian/.test(name) ? [-162.8, 53.3] : /lisbon/.test(name) ? [-10, 36] : /cascadia/.test(name) ? [-125, 46] : /samoa/.test(name) ? [-172.1, -15.5] : /kamchatka/.test(name) ? [160, 52.5] : /puerto rico/.test(name) ? [-66, 19.4] : [142.37, 38.3]; layer.view = [src[0] + (src[0] > 0 ? -25 : 25), src[1], 1]; layer.src = src; stack.push(overlays.quakeSrc(src)); break; }
      case 'storms': stack.push(overlays.storms(seed)); break;
      case 'routes': {
        const variant = /ship|port|waterfront|marine life|cable/.test(name) ? 'ship' : /shark|turtle|seal|seabird|whale|bird|migration|animal/.test(name) ? 'animal' : /satellite|orbit|iss|space|swath|goes/.test(name) ? 'sat' : 'air';
        if (variant === 'sat') stack.push(overlays.satellites()); else stack.push(overlays.routes(variant, seed));
        break;
      }
      case 'energy': stack.push(overlays.energy(seed)); break;
      case 'cities': break;                       // city labels are handled by the globe itself
      default: break;
    }
    if (layer.particles) stack.push(Particles(layer.particles, seed));
    return stack;
  }

  SOS.layers = { LAYERS, BODIES, SKIES, F, resolve, timeInfo, buildRamp, parseRGBA, cssGradient, opaque, overlays, overlayFor, Particles, isLand, whenLand, depthColor, catColor, PLATE_COLORS, MONTHS };
})();
