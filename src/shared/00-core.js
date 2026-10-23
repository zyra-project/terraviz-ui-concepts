/* ==========================================================================
   SOS Catalog Concepts — shared core
   Namespace, small utilities and illustrative geographic data
   ========================================================================== */
(function () {
  'use strict';
  const SOS = (window.SOS = window.SOS || {});
  // QA hook: collect uncaught errors / console.error output so a harness (dev/qa.html) can read them.
  window.__sosErrors = window.__sosErrors || [];
  window.addEventListener('error', (e) => { window.__sosErrors.push(`${e.message || 'error'} @${String(e.filename || '').split('/').pop()}:${e.lineno}`); });
  window.addEventListener('unhandledrejection', (e) => { window.__sosErrors.push('promise: ' + ((e.reason && e.reason.message) || e.reason)); });
  const nativeErr = console.error; console.error = function () { try { window.__sosErrors.push('console.error: ' + [].slice.call(arguments).map(String).join(' ').slice(0, 220)); } catch (er) { /* ignore */ } return nativeErr.apply(console, arguments); };
  // Test hook: "?rafshim" drives requestAnimationFrame from timers so automated (hidden) browsers can still render.
  // It also switches CSS transitions/animations/smooth-scroll off: a hidden page's animation clock never ticks, so transitions would stay on frame 0.
  if (/[?&]rafshim\b/.test(location.search)) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    const st = document.createElement('style'); st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  /* ---------- math / utility ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const wrapPI = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

  // deterministic PRNG (mulberry32) + string hash
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(r) { // Box–Muller
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const raf = (fn) => requestAnimationFrame(fn);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- colour helpers ---------- */
  function hex2rgb(h) {
    h = String(h).trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function parseColor(c, fallback = [0, 0, 0]) {
    if (!c) return fallback;
    c = String(c).trim();
    if (c[0] === '#') return hex2rgb(c);
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2]]; }
    return fallback;
  }
  const rgb01 = (c, fb) => parseColor(c, fb).map((v) => v / 255);
  function mixHex(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
  }

  /* ---------- geo helpers ---------- */
  const llToVec = (lon, lat) => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  function gcInterp(a, b, n) { // great-circle interpolation, a/b = [lonDeg, latDeg]
    const A = llToVec(a[0] * DEG, a[1] * DEG), B = llToVec(b[0] * DEG, b[1] * DEG);
    const dot = clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1);
    const om = Math.acos(dot), so = Math.sin(om) || 1e-9;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so;
      const x = k1 * A[0] + k2 * B[0], y = k1 * A[1] + k2 * B[1], z = k1 * A[2] + k2 * B[2];
      pts.push([Math.atan2(x, z) / DEG, Math.asin(clamp(y, -1, 1)) / DEG]);
    }
    return pts;
  }
  function gcDistance(a, b) { // radians
    const A = llToVec(a[0] * DEG, a[1] * DEG), B = llToVec(b[0] * DEG, b[1] * DEG);
    return Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
  }
  function unwrapLon(points) { // make longitudes continuous across the antimeridian
    const out = [points[0].slice()];
    for (let i = 1; i < points.length; i++) {
      let lon = points[i][0];
      while (lon - out[i - 1][0] > 180) lon -= 360;
      while (lon - out[i - 1][0] < -180) lon += 360;
      out.push([lon, points[i][1]]);
    }
    return out;
  }
  function catmull(points, perSeg = 8) { // smooth polyline through [lon,lat] points
    points = unwrapLon(points);
    if (points.length < 3) return points.slice();
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < perSeg; s++) {
        const t = s / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  /* ---------- illustrative geography (hand-authored, coarse) ---------- */
  // [name, lonDeg, latDeg, populationMillions]
  const CITIES = [
    ['Tokyo', 139.69, 35.69, 37], ['Delhi', 77.21, 28.61, 32], ['Shanghai', 121.47, 31.23, 29], ['São Paulo', -46.63, -23.55, 22],
    ['Mexico City', -99.13, 19.43, 22], ['Cairo', 31.24, 30.04, 21], ['Mumbai', 72.88, 19.08, 21], ['Beijing', 116.4, 39.9, 21],
    ['Dhaka', 90.41, 23.81, 22], ['Osaka', 135.5, 34.69, 19], ['New York', -74.0, 40.71, 19], ['Karachi', 67.0, 24.86, 16],
    ['Buenos Aires', -58.38, -34.6, 15], ['Istanbul', 28.98, 41.01, 15], ['Lagos', 3.38, 6.52, 15], ['Manila', 120.98, 14.6, 14],
    ['Rio de Janeiro', -43.17, -22.9, 13], ['Lima', -77.04, -12.05, 11], ['London', -0.13, 51.51, 9], ['Paris', 2.35, 48.86, 11],
    ['Moscow', 37.62, 55.76, 12], ['Kinshasa', 15.27, -4.44, 15], ['Jakarta', 106.85, -6.2, 11], ['Seoul', 126.98, 37.57, 10],
    ['Los Angeles', -118.24, 34.05, 13], ['Chicago', -87.63, 41.88, 9], ['Toronto', -79.38, 43.65, 6], ['Johannesburg', 28.05, -26.2, 6],
    ['Nairobi', 36.82, -1.29, 5], ['Sydney', 151.21, -33.87, 5], ['Melbourne', 144.96, -37.81, 5], ['Bangkok', 100.5, 13.76, 10],
    ['Singapore', 103.82, 1.35, 6], ['Hong Kong', 114.17, 22.32, 7.5], ['Tehran', 51.39, 35.69, 9], ['Baghdad', 44.37, 33.31, 7],
    ['Riyadh', 46.68, 24.71, 7], ['Madrid', -3.7, 40.42, 6.6], ['Rome', 12.5, 41.9, 4.3], ['Berlin', 13.4, 52.52, 3.7],
    ['Cape Town', 18.42, -33.92, 4.6], ['Addis Ababa', 38.75, 9.03, 5], ['Casablanca', -7.59, 33.57, 3.7], ['Accra', -0.19, 5.6, 2.5],
    ['Bogotá', -74.07, 4.71, 11], ['Santiago', -70.65, -33.45, 6.8], ['Havana', -82.37, 23.11, 2.1], ['Honolulu', -157.86, 21.31, 1],
    ['Anchorage', -149.9, 61.22, 0.3], ['Reykjavík', -21.9, 64.14, 0.2], ['Vancouver', -123.12, 49.28, 2.6], ['Miami', -80.19, 25.76, 6],
    ['Houston', -95.37, 29.76, 7], ['Denver', -104.99, 39.74, 3], ['Chennai', 80.27, 13.08, 11], ['Kolkata', 88.36, 22.57, 15],
    ['Kathmandu', 85.32, 27.72, 1.5], ['Perth', 115.86, -31.95, 2], ['Auckland', 174.76, -36.85, 1.7], ['Suva', 178.44, -18.14, 0.2],
    ['Papeete', -149.57, -17.54, 0.2], ['Ulaanbaatar', 106.9, 47.89, 1.6], ['Novosibirsk', 82.93, 55.03, 1.6], ['Vladivostok', 131.89, 43.12, 0.6],
    ['Tashkent', 69.24, 41.3, 2.5], ['Dakar', -17.47, 14.69, 3.3], ['Luanda', 13.23, -8.84, 8.3], ['Hanoi', 105.85, 21.03, 8],
    ['Lisbon', -9.14, 38.72, 2.9], ['Kyiv', 30.52, 50.45, 3], ['Nuuk', -51.72, 64.18, 0.02], ['McMurdo', 166.67, -77.85, 0.001],
  ].map(([name, lon, lat, pop]) => ({ name, lon, lat, pop }));

  // Plate boundaries / seismic belts — coarse polylines [lon,lat] (illustrative)
  const PLATES = [
    { id: 'aleutian', kind: 'trench', pts: [[-178, 51.5], [-170, 52], [-160, 54.5], [-153, 57], [-148, 59.5], [-141, 60]] },
    { id: 'cascadia', kind: 'trench', pts: [[-133, 55], [-130, 51], [-127, 48.5], [-125, 44], [-124.5, 40.5]] },
    { id: 'sanandreas', kind: 'transform', pts: [[-124.5, 40.5], [-121, 36], [-117.5, 33.5], [-114.5, 31], [-112, 27], [-108, 23]] },
    { id: 'middleamerica', kind: 'trench', pts: [[-106, 19], [-100, 16], [-95, 14.5], [-91, 13], [-87, 11.5], [-84, 9.5], [-80, 7]] },
    { id: 'andes', kind: 'trench', pts: [[-80, -2], [-78.5, -10], [-76, -15], [-72, -20], [-71.5, -27], [-73, -35], [-75, -45], [-75.5, -52]] },
    { id: 'kuril', kind: 'trench', pts: [[163, 57], [160, 53], [156, 50], [152, 46], [148, 43.5], [144, 41], [142.5, 37], [141.5, 34]] },
    { id: 'marianas', kind: 'trench', pts: [[141.5, 34], [142, 28], [143, 23], [145, 18], [146, 13], [143, 10], [138, 8]] },
    { id: 'philippine', kind: 'trench', pts: [[127.5, 15], [126.8, 11], [126.5, 7], [127, 3], [129, -1], [135, -3], [142, -4]] },
    { id: 'tonga', kind: 'trench', pts: [[-173, -15], [-174.5, -20], [-176.5, -26], [-178.5, -31], [-179.5, -35], [178, -38.5], [175, -41], [172, -43.5], [167, -46]] },
    { id: 'sunda', kind: 'trench', pts: [[94, 14], [93.5, 8], [96, 3], [99.5, -1], [103.5, -5], [108, -9], [114, -10.5], [120, -10.5], [126, -9], [131, -7.5]] },
    { id: 'himalaya', kind: 'collision', pts: [[62, 26], [66, 29], [71, 33], [76, 35], [80, 33], [85, 28.5], [90, 27.5], [95, 28], [98, 25], [97, 20]] },
    { id: 'alpide', kind: 'collision', pts: [[-9, 36.5], [-3, 36], [5, 37], [13, 38], [18, 41], [23, 39], [28, 37.5], [35, 38], [41, 38.5], [46, 36], [51, 30], [56, 27], [62, 26]] },
    { id: 'alps', kind: 'collision', pts: [[7, 44], [11, 46.3], [15, 46.5], [19, 44.5], [22, 44]] },
    { id: 'mar', kind: 'ridge', pts: [[-18, 66], [-19.5, 63], [-25, 60], [-31, 52], [-35, 45], [-38, 38], [-42, 30], [-45, 20], [-42, 12], [-35, 1], [-25, -10], [-15, -25], [-10, -35], [-5, -45], [2, -52], [10, -55]] },
    { id: 'epr', kind: 'ridge', pts: [[-110, 24], [-108, 10], [-113, -5], [-114, -20], [-113, -35], [-112, -50], [-125, -56]] },
    { id: 'mir', kind: 'ridge', pts: [[57, -2], [62, -12], [67, -22], [70, -30], [77, -38], [88, -45], [110, -49], [140, -51]] },
    { id: 'eastafrica', kind: 'rift', pts: [[43, 12], [40, 8], [37, 4], [35.5, 0], [34.5, -5], [34, -10], [35, -15]] },
    { id: 'redsea', kind: 'rift', pts: [[43, 12.5], [41, 17], [38, 21], [35, 26], [33, 28.5]] },
    { id: 'caribbean', kind: 'trench', pts: [[-66, 19.5], [-63, 17], [-61, 14], [-61.5, 11]] },
    { id: 'newguinea', kind: 'collision', pts: [[131, -1], [137, -2.5], [144, -4], [150, -6], [155, -6.5]] },
    { id: 'hikurangi', kind: 'trench', pts: [[155, -6.5], [161, -9], [167, -15], [170, -19]] },
  ];

  // Illustrative tropical-cyclone tracks (genesis → decay) [lon,lat]
  const STORM_TRACKS = [
    { name: 'Atlantic A', pts: [[-20, 12], [-31, 13], [-44, 15], [-58, 17.5], [-70, 21], [-79, 25], [-85, 28], [-89, 30.5]] },
    { name: 'Atlantic B', pts: [[-24, 10], [-38, 12], [-52, 15], [-63, 19], [-71, 24.5], [-75, 30], [-72, 36], [-62, 42], [-50, 47]] },
    { name: 'Atlantic C', pts: [[-17, 11], [-30, 11], [-48, 13], [-66, 15], [-79, 17], [-87, 19.5], [-93, 22]] },
    { name: 'Gulf', pts: [[-83, 19], [-87, 23], [-90, 26.5], [-92, 29]] },
    { name: 'Pacific A', pts: [[150, 10], [140, 14], [131, 18], [125, 22], [126, 28], [134, 34], [146, 40], [158, 46]] },
    { name: 'Pacific B', pts: [[162, 8], [147, 12], [133, 14], [121, 17], [113, 20.5], [108, 21.5]] },
    { name: 'Pacific C', pts: [[170, 13], [158, 15], [147, 19], [138, 25], [136, 32], [145, 38]] },
    { name: 'E. Pacific A', pts: [[-98, 11], [-106, 14], [-114, 17.5], [-122, 21], [-131, 24], [-141, 27]] },
    { name: 'E. Pacific B', pts: [[-104, 14], [-108, 18], [-111, 23], [-114, 29]] },
    { name: 'N. Indian', pts: [[88, 9], [85, 13], [83, 17], [85, 21], [88, 23.5]] },
    { name: 'Arabian Sea', pts: [[66, 11], [65, 15], [64, 19], [67, 22.5], [70, 24]] },
    { name: 'S. Indian A', pts: [[85, -9], [76, -12], [66, -16], [58, -20], [52, -24], [49, -28]] },
    { name: 'S. Indian B', pts: [[105, -10], [96, -13], [87, -17], [79, -22], [72, -27]] },
    { name: 'S. Pacific', pts: [[165, -9], [168, -13], [172, -18], [177, -23], [-178, -28], [-172, -33]] },
    { name: 'Coral Sea', pts: [[158, -11], [152, -14], [148, -17.5], [146, -21], [147, -25]] },
  ];

  const MIGRATION_ARCS = [ // flyways / animal tracks, coarse [lon,lat]
    [[-150, 70], [-135, 55], [-120, 40], [-100, 22], [-80, 5], [-65, -20], [-65, -50]],
    [[-70, 62], [-72, 45], [-76, 30], [-70, 18], [-62, 5], [-55, -15]],
    [[100, 65], [95, 50], [92, 35], [88, 25], [90, 10]],
    [[10, 68], [5, 55], [0, 40], [-5, 25], [5, 10], [15, -10], [25, -28]],
    [[-160, 20], [-155, 35], [-150, 45], [-145, 55], [-150, 62]],
    [[150, -35], [158, -25], [165, -10], [172, 5], [178, 20], [-175, 35], [-160, 48]],
    [[20, -35], [10, -20], [0, -5], [-12, 12], [-22, 28], [-30, 45], [-25, 60]],
    [[-80, 25], [-70, 33], [-60, 41], [-45, 48], [-30, 52], [-15, 54]],
  ];

  Object.assign(SOS, {
    TAU, DEG, clamp, lerp, smooth, easeInOut, easeOut, wrapPI, rng, hashStr, gauss, debounce, raf, esc, $, $$,
    hex2rgb, parseColor, rgb01, mixHex, llToVec, gcInterp, gcDistance, catmull,
    geo: { CITIES, PLATES, STORM_TRACKS, MIGRATION_ARCS },
  });
})();
