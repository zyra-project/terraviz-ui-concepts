/* ==========================================================================
   SOS Catalog Concepts — app state
   A tiny observable store shared by every concept: query + facets + sort,
   selection, 3D/2D mode, timeline and playlist, plus globe glue.
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;
  const { store } = SOS;

  const FILTER_KEYS = ['cats', 'subs', 'themes', 'platforms', 'flags', 'kws', 'ccc', 'dci', 'kinds'];

  function createApp(initial = {}) {
    const state = Object.assign({
      q: '', cats: [], subs: [], themes: [], platforms: [], flags: [], kws: [], ccc: [], dci: [], kinds: [], years: null, grade: null,
      sort: 'az', sel: null, mode: '3d', proj: 'equirect', playing: false, t: 0.3, opacity: 1, view: 'grid',
    }, initial);
    const subs = new Set();
    let cache = null, cacheKey = '';
    const filterKey = () => JSON.stringify([state.q, ...FILTER_KEYS.map((k) => state[k]), state.years, state.grade, state.sort]);

    const app = {
      state,
      get results() {
        const key = filterKey();
        if (!cache || key !== cacheKey) { cache = store.run(state); cacheKey = key; }
        return cache;
      },
      get selected() { return state.sel != null ? store.byId.get(state.sel) : null; },
      set(patch, meta = {}) {
        let changed = false;
        for (const k in patch) { if (JSON.stringify(state[k]) !== JSON.stringify(patch[k])) { state[k] = patch[k]; changed = true; } }
        if (changed && !meta.silent) subs.forEach((fn) => fn(patch, meta));
        return changed;
      },
      /** toggle one value inside a multi-select filter group */
      toggle(group, value, meta) {
        const cur = state[group].slice();
        const i = cur.indexOf(value);
        if (i === -1) cur.push(value); else cur.splice(i, 1);
        // removing a category also removes its sub-category pairs
        const patch = { [group]: cur };
        if (group === 'cats' && i !== -1) patch.subs = state.subs.filter((s) => s.indexOf('/') === -1 || s.split('/')[0] !== value);
        app.set(patch, meta);
      },
      only(group, value, meta) { app.set({ [group]: value == null ? [] : [value] }, meta); },
      has(group, value) { return state[group].indexOf(value) !== -1; },
      get activeFilters() {
        const out = [];
        for (const k of FILTER_KEYS) for (const v of state[k]) out.push({ group: k, value: v });
        if (state.years) out.push({ group: 'years', value: state.years });
        if (state.grade) out.push({ group: 'grade', value: state.grade });
        return out;
      },
      get hasFilters() { return !!(state.q || app.activeFilters.length); },
      clear(meta) {
        const p = { q: '', years: null, grade: null };
        FILTER_KEYS.forEach((k) => (p[k] = []));
        app.set(p, meta);
      },
      removeFilter(group, value, meta) {
        if (group === 'years' || group === 'grade') app.set({ [group]: null }, meta); else app.toggle(group, value, meta);
      },
      select(id, meta = {}) {
        app.set({ sel: id, t: id == null ? state.t : (meta.keepTime ? state.t : 0.3) }, meta);
        if (id != null && !meta.noHash) { try { history.replaceState(null, '', '#' + store.byId.get(id).slug); } catch (e) { /* file:// restrictions */ } }
        if (id == null && !meta.noHash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
      },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      notify(meta) { subs.forEach((fn) => fn({}, meta || {})); },
      /** read #slug from the URL */
      selectFromHash() {
        const slug = decodeURIComponent((location.hash || '').replace(/^#/, ''));
        const d = slug && store.bySlug.get(slug);
        if (d) { state.sel = d.id; return d; }
        return null;
      },
    };
    return app;
  }

  /* ---------- describe a dataset for the UI ---------- */
  const fmtNum = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(+v.toFixed(Math.abs(v) < 1 ? 2 : Math.abs(v) < 10 ? 1 : 0)));
  function describe(d) {
    const layer = SOS.layers.resolve(d);
    const time = SOS.layers.timeInfo(d, layer);
    let legend = null;
    if (layer.stops && layer.range && !layer.noLegendGradient && !layer.space) {
      const [lo, hi] = layer.range;
      legend = {
        css: SOS.layers.cssGradient(layer.stops), label: layer.label, unit: layer.unit || '', min: lo, max: hi,
        minLabel: fmtNum(lo), maxLabel: fmtNum(hi),
        ticks: (layer.ticks || [lo, hi]).map((v) => ({ v, pos: (v - lo) / (hi - lo), label: fmtNum(v) })),
        categorical: !!layer.categorical,
      };
    }
    const platforms = [];
    if (d.sos) platforms.push({ id: 'sos', label: 'SOS', title: 'Science On a Sphere' });
    if (d.sosx) platforms.push({ id: 'sosx', label: 'Explorer', title: 'SOS Explorer' });
    const flags = [];
    if (d.rt) flags.push({ id: 'rt', label: 'Real-time', icon: 'zap' });
    if (d.audio) flags.push({ id: 'audio', label: 'Audio', icon: 'volume' });
    if (d.narrated) flags.push({ id: 'narrated', label: 'Narrated', icon: 'film' });
    if (d.hasVariations) flags.push({ id: 'vars', label: d.vars.length + (d.vars.length === 1 ? ' variation' : ' variations'), icon: 'layers' });
    return {
      layer, time, legend, platforms, flags, coverage: SOS.fmt.coverage(d), grade: SOS.fmt.grade(d.grade),
      added: SOS.fmt.date(d.added), space: !!layer.space, accent: layer.accent || (store.CAT_META[d.cat] || {}).color,
      catMeta: store.CAT_META[d.cat] || store.CAT_META.Extras,
    };
  }

  /* ---------- wire a SOSGlobe to the app state ---------- */
  function bindGlobe(app, globe, hooks = {}) {
    let last = { sel: undefined, mode: null, proj: null, playing: null, t: null, opacity: null };
    const sync = (patch, meta = {}) => {
      const s = app.state;
      if (s.sel !== last.sel) {
        const d = app.selected;
        last.sel = s.sel;
        globe.setDataset(d, { fly: meta.fly !== false });
        const info = d ? describe(d) : null;
        if (info) globe.setLoop(info.time.loop);
        if (hooks.onDataset) hooks.onDataset(d, info);
      }
      if (s.mode !== last.mode) { last.mode = s.mode; globe.setMode(s.mode, { animate: last.mode != null && meta.animate !== false }); if (hooks.onMode) hooks.onMode(s.mode); }
      if (s.proj !== last.proj) { last.proj = s.proj; globe.setProjection(s.proj); }
      if (s.playing !== last.playing) { last.playing = s.playing; globe.play(s.playing); }
      if (s.opacity !== last.opacity) { last.opacity = s.opacity; globe.setLayerOpacity(s.opacity); }
      if (s.t !== last.t && meta.source !== 'player') { last.t = s.t; globe.setTime(s.t); }
    };
    globe.opts.onTime = (t) => { last.t = t; app.state.t = t; if (hooks.onTime) hooks.onTime(t); };
    app.subscribe(sync);
    last.mode = null;
    sync({}, { animate: false });
    return { sync };
  }

  SOS.createApp = createApp;
  SOS.describe = describe;
  SOS.bindGlobe = bindGlobe;
})();
