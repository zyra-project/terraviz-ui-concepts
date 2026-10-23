/* ==========================================================================
   SOS Catalog Concepts — SOSGlobe
   A dependency-free WebGL2 globe / map with a continuous 3D ⇄ 2D morph,
   procedural data layers, planetary bodies and a 2D overlay canvas.
   (GLSL lives in 30-shaders.js)
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;
  const { TAU, DEG, clamp, lerp, easeInOut, wrapPI, rgb01 } = SOS;
  const GLSL = SOS._glsl;

  /* ------------------------------------------------------------------ *
   *  Helpers
   * ------------------------------------------------------------------ */
  const PROJ = { equirect: 0, natural: 1, mercator: 2 };
  const PROJ_EXTENT = { equirect: [TAU, Math.PI], natural: [5.4707, 2.8446], mercator: [TAU, 6.2628] };
  const STYLE_ID = { photo: 0, flat: 1, duo: 2, duotone: 2, dots: 3 };
  const FAM_ID = { body: 1, sky: 10 };

  function flatXY(proj, lam, phi) {
    if (proj === 'natural') {
      const p2 = phi * phi, p4 = p2 * p2;
      return [lam * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))), phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))];
    }
    if (proj === 'mercator') { const ph = clamp(phi, -1.4835, 1.4835); return [lam, Math.log(Math.tan(Math.PI / 4 + ph / 2))]; }
    return [lam, phi];
  }
  function flatInv(proj, X, Y) { // returns [lamRad, phiRad]
    if (proj === 'natural') {
      let phi = Y / 1.0;
      for (let i = 0; i < 8; i++) {
        const p2 = phi * phi, p4 = p2 * p2;
        const f = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - Y;
        const e = 1e-4, q = phi + e, q2 = q * q, q4 = q2 * q2;
        const f2 = q * (1.007226 + q2 * (0.015085 + q4 * (-0.044475 + 0.028874 * q2 - 0.005916 * q4))) - Y;
        const df = (f2 - f) / e;
        phi -= f / (df || 1);
        phi = clamp(phi, -Math.PI / 2, Math.PI / 2);
      }
      const p2 = phi * phi, p4 = p2 * p2;
      const k = 0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4));
      return [X / k, phi];
    }
    if (proj === 'mercator') return [X, 2 * Math.atan(Math.exp(Y)) - Math.PI / 2];
    return [X, Y];
  }

  // Non-blocking program creation: with KHR_parallel_shader_compile the browser compiles off the main thread.
  function createProgram(gl, ext, vs, fs, label) {
    const p = gl.createProgram();
    const v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return { p, v, f, label, ext, ready: false, failed: false, u: {}, src: fs, t0: performance.now() };
  }
  function pollProgram(gl, pr) {
    if (pr.ready || pr.failed) return pr.ready;
    if (pr.ext && !gl.getProgramParameter(pr.p, pr.ext.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) {
      pr.failed = true;
      const log = gl.getShaderInfoLog(pr.f) || gl.getShaderInfoLog(pr.v) || gl.getProgramInfoLog(pr.p);
      console.error('[SOSGlobe] program "' + pr.label + '" failed:\n' + log);
      const m = /ERROR: \d+:(\d+)/.exec(log || '');
      if (m) { const lines = pr.src.split('\n'); const n = +m[1]; console.error(lines.slice(Math.max(0, n - 4), n + 2).map((l, i) => (n - 3 + i) + ': ' + l).join('\n')); }
      return false;
    }
    const n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(pr.p, i); pr.u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(pr.p, info.name); }
    pr.ready = true;
    pr.ms = Math.round(performance.now() - pr.t0);
    return true;
  }

  // 256×256 value-noise lattice: R = rand(x,y), G = rand(x+37, y+17) so one bilinear fetch yields two z-slices
  function makeNoiseData() {
    const R = SOS.rng(90210);
    const N = 256, v = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) v[i] = (R() * 256) | 0;
    const out = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, j = ((y + 17) % N) * N + ((x + 37) % N);
      out[i * 4] = v[i]; out[i * 4 + 1] = v[j]; out[i * 4 + 2] = (R() * 256) | 0; out[i * 4 + 3] = 255;
    }
    return out;
  }
  // tileable crater map: R = bowl depth, G = rim highlight, B = fine noise
  function makeCraterData(size = 512) {
    const R = SOS.rng(1337);
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#000'; x.fillRect(0, 0, size, size); x.globalCompositeOperation = 'lighter'; return x; };
    const xb = mk(), xr = mk();
    for (let i = 0; i < 900; i++) {
      const r = 3 + Math.pow(R(), 3.4) * 46;
      const x0 = R() * size, y0 = R() * size;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const x = x0 + dx, y = y0 + dy;
        if (x + r * 1.3 < 0 || x - r * 1.3 > size || y + r * 1.3 < 0 || y - r * 1.3 > size) continue;
        let g = xb.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.65, 'rgba(255,255,255,.7)'); g.addColorStop(0.92, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        xb.fillStyle = g; xb.beginPath(); xb.arc(x, y, r, 0, TAU); xb.fill();
        g = xr.createRadialGradient(x, y, r * 0.7, x, y, r * 1.25);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,.35)'); g.addColorStop(0.62, 'rgba(255,255,255,.9)'); g.addColorStop(0.8, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        xr.fillStyle = g; xr.beginPath(); xr.arc(x, y, r * 1.25, 0, TAU); xr.fill();
      }
    }
    const a = xb.getImageData(0, 0, size, size).data, b = xr.getImageData(0, 0, size, size).data;
    const out = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) { out[i * 4] = a[i * 4]; out[i * 4 + 1] = b[i * 4]; out[i * 4 + 2] = (R() * 256) | 0; out[i * 4 + 3] = 255; }
    return out;
  }

  // shared decoded images (so several globes on one page decode the data URIs once)
  const imgCache = {};
  function loadImage(src) {
    if (!imgCache[src]) {
      imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
    }
    return imgCache[src];
  }

  const DEFAULT_STYLE = {
    style: 'photo', ocean: '#0b2a5b', ocean2: '#06142e', land: '#2d6a4f', land2: '#8fbf7a', coast: '#ffffff', coastAmt: 0.0,
    grid: '#ffffff', gridAlpha: 0.0, gridStep: 15, exposure: 1.0, saturation: 1.0, gamma: 1.0,
    light: 'head', night: 0.55, nightLights: 0, atmo: '#5aa8ff', atmoAmt: 0.9, stars: 0.0,
    text: '#ffffff', halo: 'rgba(0,0,0,.55)', accent: '#ffffff', labels: true,
  };

  /* ------------------------------------------------------------------ *
   *  Globe class
   * ------------------------------------------------------------------ */
  class SOSGlobe {
    constructor(container, opts = {}) {
      this.el = container;
      this.opts = Object.assign({ mode: '3d', projection: 'equirect', interactive: true, autoRotate: 0, maxDpr: 2, zoomRange: [0.62, 9], onView: null, onHover: null, onClick: null, onTime: null, labels: true }, opts);
      this.style = Object.assign({}, DEFAULT_STYLE, opts.style || {});
      this.view = { lon: opts.lon != null ? opts.lon : -30, lat: opts.lat != null ? opts.lat : 22, zoom: opts.zoom || 1 };
      this.flatView = { zoom: 1 };
      this.morph = this.opts.mode === '2d' ? 1 : 0;
      this.morphTarget = this.morph;
      this.projection = this.opts.projection;
      this.t = 0.0;
      this.time = 0;
      this.player = { playing: false, loop: 14, dir: 1 };
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this._insetTarget = { l: 0, r: 0, t: 0, b: 0 };
      this.layer = SOS.layers.LAYERS.earth;
      this.overlays = [];
      this.layerOpacity = 1;
      this.sun = { lon: -0.6, lat: 0.3 };
      this.src = [142.37, 38.3];
      this.vel = { lon: 0, lat: 0 };
      this.dirty = true;
      this.destroyed = false;
      this.hover = null;
      this._anim = null;
      this._idleSince = performance.now();
      this._dragging = false;
      this._ready = false;
      this._visible = true;
      this._pointers = new Map();
      this.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this._buildDom();
      try { this._initGL(); } catch (e) { console.error(e); this._fallback(e); return; }
      this._bind();
      this._resize();
      this._loadTextures();
      this.setLayerObject(SOS.layers.LAYERS.earth);
      this._last = performance.now();
      this._raf = requestAnimationFrame((n) => this._tick(n));
    }

    /* ---------- DOM ---------- */
    _buildDom() {
      const el = this.el;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.classList.add('sosglobe');
      el.setAttribute('tabindex', el.getAttribute('tabindex') || '0');
      el.setAttribute('role', 'application');
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Interactive globe. Drag to rotate, scroll to zoom, arrow keys to pan.');
      el.style.touchAction = 'none';
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'sosglobe__gl';
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;';
      this.ov = document.createElement('canvas');
      this.ov.className = 'sosglobe__ov';
      this.ov.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';
      el.prepend(this.ov); el.prepend(this.canvas);
      this.octx = this.ov.getContext('2d');
    }
    _fallback(err) {
      this.failed = true;
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:inherit;font:14px/1.5 system-ui;text-align:center;padding:24px;opacity:.8';
      d.textContent = 'WebGL 2 is unavailable in this browser, so the interactive globe cannot render.';
      this.el.appendChild(d);
    }

    /* ---------- GL ---------- */
    _initGL() {
      const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 not available');
      this.gl = gl;
      this.pext = gl.getExtension('KHR_parallel_shader_compile');
      this.progs = {
        earth: createProgram(gl, this.pext, GLSL.VERT, GLSL.FRAG_HEAD + GLSL.FRAG_FIELDS + GLSL.FRAG_MAIN_EARTH, 'earth'),
        bg: createProgram(gl, this.pext, GLSL.BG_VERT, GLSL.BG_FRAG, 'background'),
        body: null,
      };
      this._bodyTimer = setTimeout(() => this._ensureBody(), 1800);   // pre-warm the planet shader once idle

      // mesh
      const NX = 256, NY = 128;
      const verts = new Float32Array((NX + 1) * (NY + 1) * 2);
      let k = 0;
      for (let y = 0; y <= NY; y++) for (let x = 0; x <= NX; x++) { verts[k++] = -Math.PI + (x / NX) * TAU; verts[k++] = -Math.PI / 2 + (y / NY) * Math.PI; }
      const idx = new Uint16Array(NX * NY * 6);
      k = 0;
      for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
        const a = y * (NX + 1) + x, b = a + 1, c = a + (NX + 1), d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
      this.indexCount = idx.length;
      this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.bgVao = gl.createVertexArray();

      // textures (placeholders until images decode)
      const mk = (unit, w, h, data) => {
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.tex = {
        relief: mk(0, 1, 1, new Uint8Array([10, 30, 70, 255])),
        mask: mk(1, 1, 1, new Uint8Array([128, 128, 128, 255])),
        lights: mk(2, 1, 1, new Uint8Array([0, 0, 0, 255])),
        ramp: mk(3, 256, 1, new Uint8Array(256 * 4)),
        noise: mk(4, 256, 256, makeNoiseData()),
        craters: mk(5, 1, 1, new Uint8Array([0, 0, 0, 255])),
      };
      // noise lattice repeats in both axes
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.tex.noise);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.failed = true; });
    }

    _loadTextures() {
      const gl = this.gl;
      const up = (unit, tex, img, mip = true) => {
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if (mip) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        }
        this.dirty = true;
      };
      const A = window.SOS_ASSETS || {};
      const jobs = [['relief', 0], ['mask', 1], ['lights', 2]].map(([k, u]) => (A[k] ? loadImage(A[k]).then((img) => { if (!this.destroyed) up(u, this.tex[k], img); }) : Promise.resolve()));
      Promise.all(jobs).then(() => { this._ready = true; this.dirty = true; }).catch((e) => console.warn('[SOSGlobe] texture load failed', e));
    }

    /** planetary-body shader + crater map are only built when a Space dataset is first shown (or after an idle delay) */
    _ensureBody() {
      if (this.progs.body || this.destroyed || this.failed) return;
      const gl = this.gl;
      this.progs.body = createProgram(gl, this.pext, GLSL.VERT, GLSL.FRAG_HEAD + GLSL.FRAG_BODIES + GLSL.FRAG_MAIN_BODY, 'body');
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.tex.craters);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeCraterData(512));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.dirty = true;
    }

    /* ---------- public API ---------- */
    setStyle(partial) { Object.assign(this.style, partial); this.dirty = true; return this; }
    /** read --g-* CSS custom properties from an element and apply them */
    themeFromCSS(el) {
      el = el || this.el;
      const cs = getComputedStyle(el);
      const g = (n) => cs.getPropertyValue('--g-' + n).trim();
      const s = {};
      const set = (k, name, f) => { const v = g(name); if (v !== '') s[k] = f ? f(v) : v; };
      set('style', 'style'); set('ocean', 'ocean'); set('ocean2', 'ocean2'); set('land', 'land'); set('land2', 'land2'); set('coast', 'coast');
      set('coastAmt', 'coast-a', parseFloat); set('grid', 'grid'); set('gridAlpha', 'grid-a', parseFloat); set('gridStep', 'grid-step', parseFloat);
      set('exposure', 'exposure', parseFloat); set('saturation', 'sat', parseFloat); set('gamma', 'gamma', parseFloat);
      set('light', 'light'); set('night', 'night', parseFloat); set('nightLights', 'lights', parseFloat);
      set('atmo', 'atmo'); set('atmoAmt', 'atmo-a', parseFloat); set('stars', 'stars', parseFloat);
      set('text', 'text'); set('halo', 'halo'); set('accent', 'accent');
      const ff = getComputedStyle(this.el).fontFamily; if (ff) s.font = ff;
      Object.assign(this.style, s);
      this.dirty = true;
      return this;
    }
    /** zoom at which the flat map fills the available height (never below "contain") */
    flatFitZoom() {
      if (this.opts.flatFit === 'contain') return 1;
      this._update();
      const c = this._c;
      return clamp((c.fitH * 0.9) / (c.ext[1] * c.s0), 1, 2.2);
    }
    setMode(mode, { animate = true } = {}) {
      const to2d = mode === '2d';
      const changing = to2d !== (this.morphTarget > 0.5);
      this.morphTarget = to2d ? 1 : 0;
      if (!animate) this.morph = this.morphTarget;
      this.opts.mode = mode;
      if (changing && this.gl) {
        // each mode remembers its own zoom; the flat map defaults to filling the available height
        if (to2d) { this._zoom3d = this.view.zoom; const z = this._zoom2d || this.flatFitZoom(); animate ? this.flyTo(this.view.lon, this.view.lat, z, { dur: 900 }) : (this.view.zoom = z); }
        else { this._zoom2d = this.view.zoom; const z = this._zoom3d || 1; animate ? this.flyTo(this.view.lon, this.view.lat, z, { dur: 900 }) : (this.view.zoom = z); }
      }
      this.dirty = true; this._emitView();
      return this;
    }
    get mode() { return this.morphTarget > 0.5 ? '2d' : '3d'; }
    setProjection(p) { if (PROJ[p] != null) { this.projection = p; this.dirty = true; this._emitView(); } return this; }
    setInsets(ins, animate = true) {
      Object.assign(this._insetTarget, ins);
      if (!animate) Object.assign(this.insets, this._insetTarget);
      this.dirty = true; return this;
    }
    setTime(t) { this.t = clamp(t, 0, 1); this.dirty = true; return this; }
    play(on = true) { this.player.playing = !!on; this._last = performance.now(); this.dirty = true; return this; }
    setLoop(seconds) { this.player.loop = seconds; return this; }
    setLayerOpacity(o) { this.layerOpacity = o; this.dirty = true; return this; }
    setSun(lonRad, latRad) { this.sun = { lon: lonRad, lat: latRad }; this.dirty = true; return this; }
    setAutoRotate(degPerSec) { this.opts.autoRotate = degPerSec; this.dirty = true; return this; }

    /** show a dataset: resolves its layer, overlays, and (optionally) flies to the relevant region */
    setDataset(d, { fly = true, dur = 1400 } = {}) {
      const layer = d ? SOS.layers.resolve(d) : SOS.layers.LAYERS.earth;
      this.dataset = d || null;
      this.setLayerObject(layer, d);
      if (layer.view && fly) {
        const v = layer.view;
        const z = this.morphTarget > 0.5 ? Math.max(v[2] || 1, this.flatFitZoom()) : (v[2] || 1);
        this.flyTo(v[0], v[1], z, { dur });
      }
      return layer;
    }
    setLayerObject(layer, d) {
      this.layer = layer;
      const gl = this.gl;
      if (this.failed) return;
      const stops = layer.stops || [[0, '#000'], [1, '#fff']];
      const ramp = SOS.layers.buildRamp(stops);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tex.ramp);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(ramp.buffer));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      this._layerOverlays = d ? SOS.layers.overlayFor(d, layer) : [];
      if (!d && layer.overlay && layer.overlay !== 'cities' && SOS.layers.overlays[layer.overlay]) { const o = SOS.layers.overlays[layer.overlay](layer.id); if (o) this._layerOverlays = [o]; }
      this._rebuildOverlays();
      if (layer.src) this.src = layer.src;
      this.sunAuto = !!layer.dayNight;
      if (layer.space) this._ensureBody();
      this.dirty = true;
    }
    _rebuildOverlays() {
      let o = this._layerOverlays || [];
      if (this.opts.labels && this.layer && !this.layer.space) {
        if (!this._cities) this._cities = SOS.layers.overlays.cities();
        o = [this._cities].concat(o);
      }
      this.overlays = o;
    }
    setLabels(on) { this.opts.labels = !!on; this._rebuildOverlays(); this.dirty = true; return this; }
    flyTo(lon, lat, zoom, { dur = 1200, ease = easeInOut } = {}) {
      if (this.reduceMotion) dur = 0;
      const from = { lon: this.view.lon, lat: this.view.lat, zoom: this.view.zoom };
      let dl = wrapPI((lon - from.lon) * DEG) / DEG;
      this._anim = { from, to: { lon: from.lon + dl, lat: clamp(lat, -88, 88), zoom: clamp(zoom != null ? zoom : from.zoom, this.opts.zoomRange[0], this.opts.zoomRange[1]) }, t0: performance.now(), dur, ease };
      this.vel.lon = this.vel.lat = 0;
      this.dirty = true;
      if (dur === 0) this._stepAnim(performance.now() + 1);
    }
    zoomBy(f, cx, cy) {
      const z = clamp(this.view.zoom * f, this.opts.zoomRange[0], this.opts.zoomRange[1]);
      if (this.morph > 0.5 && cx != null) {
        const before = this.unproject(cx, cy);
        this.view.zoom = z; this._update();
        const after = this.unproject(cx, cy);
        if (before && after) { this.view.lon += wrapPI((before.lon - after.lon) * DEG) / DEG; this.view.lat = clamp(this.view.lat + (before.lat - after.lat), -85, 85); }
      } else this.view.zoom = z;
      this._anim = null; this.dirty = true; this._emitView();
    }
    resetView() { const v = this.layer && this.layer.view ? this.layer.view : [-30, 22, 1]; this.flyTo(v[0], v[1], v[2] || 1); }
    destroy() { this.destroyed = true; clearTimeout(this._bodyTimer); cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect(); if (this._io) this._io.disconnect(); try { const x = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ignore */ } this.canvas.remove(); this.ov.remove(); }

    /* ---------- sizing ---------- */
    _resize() {
      const r = this.el.getBoundingClientRect();
      const W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
      let dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
      const maxPx = 5.2e6;
      if (W * H * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (W * H));
      this.dpr = dpr; this.W = W; this.H = H;
      for (const c of [this.canvas, this.ov]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      this.dirty = true;
    }

    /* ---------- camera math ---------- */
    _update() {
      const W = this.W, H = this.H;
      const ins = this.insets;
      const fitW = Math.max(40, W - ins.l - ins.r), fitH = Math.max(40, H - ins.t - ins.b);
      const cxPx = W / 2 + (ins.l - ins.r) / 2, cyPx = H / 2 + (ins.t - ins.b) / 2;
      const ox = (cxPx - W / 2) / (W / 2), oy = -(cyPx - H / 2) / (H / 2);
      const fov = 30 * DEG, tanHalf = Math.tan(fov / 2), aspect = W / H;
      const R0 = 0.5 * 0.84 * Math.min(fitW, fitH);
      const zoom = this.view.zoom;
      const Rpx = R0 * zoom;
      const ry = Rpx / (H / 2);
      const T = ry * tanHalf;
      const d = Math.sqrt(1 + 1 / (T * T));
      // flat map scale
      const ext = PROJ_EXTENT[this.projection];
      let s0;
      if (this.projection === 'mercator') s0 = (fitW * 0.97) / ext[0];
      else s0 = Math.min((fitW * 0.97) / ext[0], (fitH * 0.94) / ext[1]);
      const fz = this.view.zoom;                       // share zoom between modes (relative to its own fit)
      const scalePx = s0 * Math.max(fz, 0.4);
      const kView = (scalePx * 2 * d * tanHalf) / H;
      const lon0 = this.view.lon * DEG, lat0 = this.view.lat * DEG;
      const cl = Math.cos(lon0), sl = Math.sin(lon0), cp = Math.cos(lat0), sp = Math.sin(lat0);
      const m = [cl, 0, -sl, -sp * sl, cp, -sp * cl, cp * sl, sp, cp * cl];   // row-major m00 m01 m02 | m10 ...
      const near = 0.05, far = 60, f = 1 / tanHalf;
      const P = new Float32Array(16);
      P[0] = f / aspect; P[5] = f; P[10] = (far + near) / (near - far); P[11] = -1; P[14] = (2 * far * near) / (near - far);
      P[8] = -ox; P[9] = -oy;
      // flat map centre: keep the map inside the view (vertical clamp always; horizontal clamp when wrapping is off)
      const wrapOn = this.opts.wrap !== false;
      const k0 = this.projection === 'natural' ? 0.8707 : 1;
      let flon0 = lon0;
      if (!wrapOn) { const hv = (fitW / 2) / (scalePx * k0); const lim = Math.max(0, Math.PI - hv); flon0 = clamp(wrapPI(lon0), -lim, lim); }
      const Yraw = flatXY(this.projection, 0, lat0)[1];
      const Ymax = Math.max(0, ext[1] / 2 - (fitH / 2) / scalePx);
      const Yclamped = clamp(Yraw, -Ymax, Ymax);
      const flatY0 = lerp(Yraw, Yclamped, clamp(this.morph * 1.0, 0, 1));
      this._c = { W, H, ox, oy, tanHalf, aspect, d, Rpx, cxPx, cyPx, kView, scalePx, m, P, lon0, lat0, flatY0, flon0, morph: this.morph, proj: this.projection, zoom, ext, wrapOn, s0, fitW, fitH };
      if (this.morph >= 0.999) {                          // write the clamped centre back so dragging never feels "sticky"
        if (Yclamped !== Yraw) this.view.lat = flatInv(this.projection, 0, Yclamped)[1] / DEG;
        if (!wrapOn && flon0 !== lon0) this.view.lon = flon0 / DEG;
      }
      this._rot = new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
    }

    /** lon/lat (deg) -> [x, y, visibility] in CSS px */
    project(lonDeg, latDeg) {
      const c = this._c;
      const lon = lonDeg * DEG, lat = latDeg * DEG;
      const cl = Math.cos(lat), sx = cl * Math.sin(lon), sy = Math.sin(lat), sz = cl * Math.cos(lon);
      const m = c.m;
      const gx = m[0] * sx + m[2] * sz, gy = m[3] * sx + m[4] * sy + m[5] * sz, gz = m[6] * sx + m[7] * sy + m[8] * sz;
      let px = gx, py = gy, pz = gz, vis = clamp((gz - 1 / c.d) / 0.09, 0, 1);
      if (c.morph > 1e-4) {
        const lam = wrapPI(lon - c.flon0);
        const xy = flatXY(c.proj, lam, lat);
        const fx = xy[0] * c.kView, fy = (xy[1] - c.flatY0) * c.kView;
        px = lerp(gx, fx, c.morph); py = lerp(gy, fy, c.morph); pz = lerp(gz, 0, c.morph);
        vis = lerp(vis, 1, c.morph);
      }
      const w = c.d - pz;
      const nx = px / (w * c.tanHalf * c.aspect) + c.ox, ny = py / (w * c.tanHalf) + c.oy;
      return [(nx * 0.5 + 0.5) * c.W, (0.5 - ny * 0.5) * c.H, vis];
    }
    /** CSS px -> {lon, lat} (deg) or null when off the globe/map */
    unproject(x, y) {
      const c = this._c;
      const nx = ((x / c.W) * 2 - 1) - c.ox, ny = (1 - (y / c.H) * 2) - c.oy;
      if (c.morph < 0.5) {
        const dx = nx * c.tanHalf * c.aspect, dy = ny * c.tanHalf;
        const len = Math.hypot(dx, dy, 1), dir = [dx / len, dy / len, -1 / len];
        const o = [0, 0, c.d];
        const b = o[2] * dir[2];
        const disc = b * b - (c.d * c.d - 1);
        if (disc < 0) return null;
        const s = -b - Math.sqrt(disc);
        const hx = dir[0] * s, hy = dir[1] * s, hz = o[2] + dir[2] * s;
        const m = c.m; // inverse = transpose
        const wx = m[0] * hx + m[3] * hy + m[6] * hz, wy = m[1] * hx + m[4] * hy + m[7] * hz, wz = m[2] * hx + m[5] * hy + m[8] * hz;
        return { lon: Math.atan2(wx, wz) / DEG, lat: Math.asin(clamp(wy, -1, 1)) / DEG };
      }
      const vx = nx * c.d * c.tanHalf * c.aspect, vy = ny * c.d * c.tanHalf;
      const X = vx / c.kView, Y = vy / c.kView + c.flatY0;
      const [lam, phi] = flatInv(c.proj, X, Y);
      if (Math.abs(phi) > Math.PI / 2 || Math.abs(lam) > Math.PI * 1.001 * 1.0) { if (Math.abs(phi) > Math.PI / 2) return null; }
      return { lon: wrapPI(lam + c.flon0) / DEG, lat: phi / DEG };
    }
    pxPerRadian() { return this.morph > 0.5 ? this._c.scalePx : this._c.Rpx; }

    /* ---------- interaction ---------- */
    _bind() {
      const el = this.el;
      if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(el); }
      if (typeof IntersectionObserver !== 'undefined') { this._io = new IntersectionObserver((e) => { this._visible = e[0].isIntersecting; if (this._visible) this.dirty = true; }, { threshold: 0 }); this._io.observe(el); }
      if (!this.opts.interactive) return;
      let lastX = 0, lastY = 0, lastT = 0;
      const rectOf = () => el.getBoundingClientRect();
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target.closest && e.target.closest('[data-globe-ignore]')) return;
        el.setPointerCapture(e.pointerId);
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this._dragging = true; this._moved = 0; this._downAt = { x: e.clientX, y: e.clientY };
        lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
        this.vel.lon = this.vel.lat = 0; this._anim = null; this._idleSince = performance.now();
        if (this._pointers.size === 2) { const [a, b] = [...this._pointers.values()]; this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.view.zoom }; }
        el.classList.add('is-dragging');
      });
      el.addEventListener('pointermove', (e) => {
        const r = rectOf();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._dragging && this._pointers.size >= 2 && this._pinch) {
          const [a, b] = [...this._pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const z = clamp(this._pinch.z * (dist / this._pinch.d), this.opts.zoomRange[0], this.opts.zoomRange[1]);
          this.view.zoom = z; this.dirty = true; this._emitView();
          return;
        }
        if (this._dragging && this._pointers.size === 1) {
          const dx = e.clientX - lastX, dy = e.clientY - lastY, now = performance.now(), dt = Math.max(1, now - lastT);
          this._moved += Math.abs(dx) + Math.abs(dy);
          this._update();
          const k = 1 / this.pxPerRadian();
          let dLon, dLat;
          if (this.morph > 0.5) {
            const c = this._c; const ph = c.lat0;
            const kx = c.proj === 'natural' ? 0.8707 - 0.131979 * ph * ph : 1;
            const ky = c.proj === 'mercator' ? 1 / Math.max(0.2, Math.cos(ph)) : 1;
            dLon = (-dx * k) / kx / DEG; dLat = (dy * k) / ky / DEG;
          } else {
            dLon = (-dx * k) / Math.max(0.3, Math.cos(this.view.lat * DEG)) / DEG; dLat = (dy * k) / DEG;
          }
          this.view.lon = wrapPI((this.view.lon + dLon) * DEG) / DEG;
          this.view.lat = clamp(this.view.lat + dLat, this.morph > 0.5 ? -84 : -89, this.morph > 0.5 ? 84 : 89);
          this.vel.lon = lerp(this.vel.lon, (dLon / dt) * 1000, 0.5); this.vel.lat = lerp(this.vel.lat, (dLat / dt) * 1000, 0.5);
          lastX = e.clientX; lastY = e.clientY; lastT = now;
          this.dirty = true; this._emitView();
        } else if (e.pointerType === 'mouse' || !this._dragging) {
          this._update();
          const h = this.unproject(x, y);
          this.hover = h;
          if (this.opts.onHover) this.opts.onHover(h, { x, y });
        }
      });
      const up = (e) => {
        this._pointers.delete(e.pointerId);
        if (this._pointers.size < 2) this._pinch = null;
        if (this._pointers.size === 0) {
          this._dragging = false; el.classList.remove('is-dragging');
          const wasClick = this._moved < 5;
          if (wasClick && this.opts.onClick) { const r = rectOf(); this._update(); this.opts.onClick(this.unproject(e.clientX - r.left, e.clientY - r.top), { x: e.clientX - r.left, y: e.clientY - r.top }); }
          if (!wasClick && (Math.abs(this.vel.lon) > 8 || Math.abs(this.vel.lat) > 8) && performance.now() - lastT < 80) this._inertia = true; else this.vel.lon = this.vel.lat = 0;
          this._idleSince = performance.now();
        }
      };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', () => { if (this.opts.onHover && !this._dragging) { this.hover = null; this.opts.onHover(null); } });
      el.addEventListener('wheel', (e) => {
        if (e.target.closest && e.target.closest('[data-globe-ignore]')) return;
        e.preventDefault();
        const r = rectOf();
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
        this._update();
        this.zoomBy(f, e.clientX - r.left, e.clientY - r.top);
        this._idleSince = performance.now();
      }, { passive: false });
      el.addEventListener('dblclick', (e) => {
        if (e.target.closest && e.target.closest('[data-globe-ignore]')) return;
        const r = rectOf(); this._update();
        const h = this.unproject(e.clientX - r.left, e.clientY - r.top);
        if (h) this.flyTo(h.lon, h.lat, Math.min(this.opts.zoomRange[1], this.view.zoom * 1.8), { dur: 700 });
      });
      el.addEventListener('keydown', (e) => {
        if (e.target !== el) return;
        const step = 10 / Math.max(1, this.view.zoom);
        const k = e.key;
        if (k === 'ArrowLeft') this.view.lon -= step; else if (k === 'ArrowRight') this.view.lon += step;
        else if (k === 'ArrowUp') this.view.lat = clamp(this.view.lat + step, -85, 85); else if (k === 'ArrowDown') this.view.lat = clamp(this.view.lat - step, -85, 85);
        else if (k === '+' || k === '=') this.zoomBy(1.25); else if (k === '-' || k === '_') this.zoomBy(0.8);
        else if (k === '0') this.resetView(); else return;
        e.preventDefault(); this._anim = null; this.dirty = true; this._emitView(); this._idleSince = performance.now();
      });
    }
    _emitView() { if (this.opts.onView) this.opts.onView({ lon: this.view.lon, lat: this.view.lat, zoom: this.view.zoom, mode: this.mode, morph: this.morph }); }

    /* ---------- frame loop ---------- */
    _stepAnim(now) {
      const a = this._anim; if (!a) return false;
      const u = a.dur <= 0 ? 1 : clamp((now - a.t0) / a.dur, 0, 1);
      const e = a.ease(u);
      this.view.lon = wrapPI(lerp(a.from.lon, a.to.lon, e) * DEG) / DEG;
      this.view.lat = lerp(a.from.lat, a.to.lat, e);
      this.view.zoom = lerp(a.from.zoom, a.to.zoom, e);
      if (u >= 1) this._anim = null;
      this._emitView();
      return true;
    }
    _tick(now) {
      if (this.destroyed) return;
      this._raf = requestAnimationFrame((n) => this._tick(n));
      if (this.failed || !this._visible || document.hidden) return;
      const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
      this.time += dt;
      let need = this.dirty;
      // view animation
      if (this._anim) { this._stepAnim(now); need = true; }
      // inertia
      if (this._inertia && !this._dragging) {
        this.view.lon = wrapPI((this.view.lon + this.vel.lon * dt) * DEG) / DEG;
        this.view.lat = clamp(this.view.lat + this.vel.lat * dt, this.morph > 0.5 ? -84 : -89, this.morph > 0.5 ? 84 : 89);
        const f = Math.exp(-dt * 3.2); this.vel.lon *= f; this.vel.lat *= f;
        if (Math.abs(this.vel.lon) < 0.6 && Math.abs(this.vel.lat) < 0.6) { this._inertia = false; this.vel.lon = this.vel.lat = 0; }
        need = true; this._emitView();
      }
      // auto-rotate when idle (3D only)
      if (this.opts.autoRotate && !this.reduceMotion && !this._dragging && !this._anim && !this._inertia && this.morph < 0.05 && now - this._idleSince > 2500) {
        this.view.lon = wrapPI((this.view.lon + this.opts.autoRotate * dt) * DEG) / DEG; need = true; this._emitView();
      }
      // morph
      if (Math.abs(this.morph - this.morphTarget) > 1e-4) {
        const spd = this.reduceMotion ? 10 : 1 / 0.95;
        const dir = Math.sign(this.morphTarget - this.morph);
        this.morph = clamp(this.morph + dir * dt * spd, 0, 1);
        if ((dir > 0 && this.morph >= this.morphTarget) || (dir < 0 && this.morph <= this.morphTarget)) { this.morph = this.morphTarget; }
        need = true; this._emitView();
      }
      // insets
      for (const k of ['l', 'r', 't', 'b']) {
        const d = this._insetTarget[k] - this.insets[k];
        if (Math.abs(d) > 0.3) { this.insets[k] += d * Math.min(1, dt * 9); need = true; } else if (d !== 0) { this.insets[k] = this._insetTarget[k]; need = true; }
      }
      // timeline player
      if (this.player.playing) {
        this.t += (dt / this.player.loop) * this.player.dir;
        if (this.t > 1) this.t -= 1; else if (this.t < 0) this.t += 1;
        need = true;
        if (this.opts.onTime) this.opts.onTime(this.t);
      }
      // particle overlays + animated layers
      const animLayer = this.layer && (this.layer.anim || this.layer.particles);
      if (animLayer || this.overlays.some((o) => o.step || o.animated)) need = true;
      if (!this._ready || !this._announced) need = true;
      if (need) { this.dirty = false; this._draw(now, dt); }
    }

    _applySun() {
      if (this.layer && this.layer.sunFixed) {
        this.sun = { lon: this.layer.sunFixed[0], lat: this.layer.sunFixed[1] };
      } else if (this.layer && this.layer.dayNight) {
        // declination follows season; subsolar longitude drifts with time (one day per ~40 s)
        const decl = 23.44 * DEG * Math.sin(TAU * (this.t - 0.22));
        this.sun = { lon: -(((this.time * 0.157) % TAU)) + 0.6, lat: decl };
      } else if (this.style.light === 'sun') {
        this.sun = this.sun || { lon: -0.6, lat: 0.3 };
      }
    }

    _poll() {
      const gl = this.gl;
      const e = pollProgram(gl, this.progs.earth);
      pollProgram(gl, this.progs.bg);
      if (this.progs.body) pollProgram(gl, this.progs.body);
      if (!this._announced && e && this.progs.bg.ready && this._ready) {
        this._announced = true;
        if (this.opts.onReady) this.opts.onReady(this);
        this.el.dispatchEvent(new CustomEvent('globeready'));
      }
      if (this.progs.earth.failed || this.progs.bg.failed) { this.failed = true; this._fallback(); }
      return e;
    }

    _draw(now, dt) {
      const gl = this.gl, S = this.style, L = this.layer || {};
      this._poll();
      const B = L.space ? L : null;
      const P = B ? this.progs.body : this.progs.earth;
      const bg = this.progs.bg;
      if (!P || !P.ready || !bg.ready) { this.dirty = true; return; }   // still compiling — keep polling
      this._update();
      const c = this._c;
      this._applySun();
      const dprW = this.canvas.width, dprH = this.canvas.height;
      gl.viewport(0, 0, dprW, dprH);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // ---- background: stars + atmosphere glow ----
      let u = bg.u;
      gl.useProgram(bg.p); gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(this.bgVao);
      gl.uniform2f(u.uRes, dprW, dprH);
      gl.uniform2f(u.uCenter, c.cxPx * this.dpr, c.cyPx * this.dpr);
      gl.uniform1f(u.uRadius, c.Rpx * this.dpr);
      const atmo = rgb01(B && L.accent ? L.accent : S.atmo, [0.35, 0.65, 1]);
      gl.uniform3f(u.uAtmo, atmo[0], atmo[1], atmo[2]);
      gl.uniform1f(u.uAtmoAmt, (S.atmoAmt || 0) * (B && L.fam === 8 ? 1.4 : 1));
      gl.uniform1f(u.uStars, S.stars || 0);
      gl.uniform1f(u.uMorph, c.morph);
      gl.uniform2f(u.uShift, this.view.lon * 3.0 * this.dpr, -this.view.lat * 3.0 * this.dpr);
      gl.uniform1f(u.uTime, this.time);
      if (S.atmoAmt > 0 || S.stars > 0) gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);

      // ---- earth / body mesh ----
      u = P.u;
      const f1 = (n, v) => { if (u[n] != null) gl.uniform1f(u[n], v); };
      const i1 = (n, v) => { if (u[n] != null) gl.uniform1i(u[n], v); };
      const f2 = (n, a, b) => { if (u[n] != null) gl.uniform2f(u[n], a, b); };
      const f3 = (n, a, b, c3) => { if (u[n] != null) gl.uniform3f(u[n], a, b, c3); };
      const col3 = (n, col) => { const v = rgb01(col, [0, 0, 0]); f3(n, v[0], v[1], v[2]); };
      gl.useProgram(P.p); gl.bindVertexArray(this.vao);
      const unit = (name, i, uname) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.tex[name]); i1(uname, i); };
      unit('relief', 0, 'uRelief'); unit('mask', 1, 'uMask'); unit('lights', 2, 'uLights'); unit('ramp', 3, 'uRamp'); unit('noise', 4, 'uNoise'); unit('craters', 5, 'uCraters');
      gl.uniformMatrix4fv(u.uProj, false, c.P);
      gl.uniformMatrix3fv(u.uRot, false, this._rot);
      f1('uDist', c.d); f1('uMorph', c.morph); i1('uProjType', PROJ[this.projection]);
      f1('uTime', this.time); f1('uT', this.t);
      i1('uStyle', STYLE_ID[S.style] != null ? STYLE_ID[S.style] : 0);
      col3('uOcean', S.ocean); col3('uOcean2', S.ocean2); col3('uLand', S.land); col3('uLand2', S.land2); col3('uCoast', S.coast); col3('uGridC', S.grid);
      f1('uCoastAmt', S.coastAmt); f1('uGrid', S.gridAlpha); f1('uGridStep', S.gridStep);
      f1('uExposure', S.exposure); f1('uSat', S.saturation); f1('uGamma', S.gamma);
      i1('uLightMode', L.dayNight ? 2 : S.light === 'sun' ? 2 : S.light === 'none' ? 0 : 1);
      f2('uSun', this.sun.lon, this.sun.lat);
      f1('uNight', L.dayNight ? Math.max(S.night, 0.8) : S.night);
      f1('uNightLights', L.id === 'lights' ? 1 : (S.nightLights || 0));
      const atmo2 = rgb01(B && L.accent ? L.accent : S.atmo, [0.35, 0.65, 1]);
      f3('uAtmo', atmo2[0], atmo2[1], atmo2[2]); f1('uAtmoAmt', S.atmoAmt || 0);
      i1('uField', B ? 0 : (L.field || 0));
      f1('uLayerOpacity', this.layerOpacity);
      f2('uSrc', this.src[0] * DEG, this.src[1] * DEG);
      f1('uSeed', (L.seed || 0) * 0.137);
      if (B) {
        i1('uBody', B.fam);
        const c0 = rgb01(B.colors[0]), c1 = rgb01(B.colors[1]), c2 = rgb01(B.colors[2]);
        f3('uBA', c0[0], c0[1], c0[2]); f3('uBB', c1[0], c1[1], c1[2]); f3('uBC', c2[0], c2[1], c2[2]);
        if (u.uBP != null) gl.uniform4f(u.uBP, B.P[0], B.P[1], B.P[2], B.P[3]);
      } else i1('uBody', 0);

      const tiles = c.morph > 0.999 && c.wrapOn ? [-1, 0, 1] : [0];
      for (const tile of tiles) {
        gl.uniform4f(u.uFlat, c.kView, c.flon0, c.flatY0, tile);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindVertexArray(null);
      this._drawOverlay(now, dt);
    }

    _drawOverlay(now, dt) {
      const ctx = this.octx, c = this._c;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.ov.width, this.ov.height);
      if (!this.overlays.length) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const view = {
        w: this.W, h: this.H, dpr: 1, zoom: this.view.zoom, flat: this.morph,
        accent: this.style.accent, text: this.style.text, halo: this.style.halo, font: this.style.font,
        project: (lon, lat) => this.project(lon, lat),
      };
      // overlays draw in CSS px; font sizes are specified relative to dpr=1 here
      for (const o of this.overlays) {
        if (o.step) o.step(dt, this.time);
        o.draw(ctx, view, this.t, this.time);
      }
    }
  }

  SOS.Globe = SOSGlobe;
  SOS.createGlobe = (el, opts) => new SOSGlobe(el, opts);
})();
