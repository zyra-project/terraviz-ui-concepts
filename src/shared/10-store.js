/* ==========================================================================
   SOS Catalog Concepts — dataset store
   Hydrates the real NOAA SOS catalog, and provides search / facets / sort / playlist
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;
  const BASE = 'https://sos.noaa.gov';

  const CAT_ORDER = ['Air', 'Water', 'Land', 'Snow and Ice', 'Space', 'People', 'Extras'];
  const CAT_META = {
    'Air':          { key: 'air',   icon: 'wind',     color: '#4fb3ff', blurb: 'Weather, aerosols, chemistry and climate in the atmosphere.' },
    'Water':        { key: 'water', icon: 'drop',     color: '#2d7ff9', blurb: 'Oceans, currents, tsunamis, freshwater and marine life.' },
    'Land':         { key: 'land',  icon: 'mountain', color: '#3fb56f', blurb: 'Land cover, tectonics, agriculture and the night-time Earth.' },
    'Snow and Ice': { key: 'ice',   icon: 'snow',     color: '#7ad7f0', blurb: 'Sea ice, glaciers and the changing cryosphere.' },
    'Space':        { key: 'space', icon: 'planet',   color: '#9a7bff', blurb: 'Planets, moons, the Sun and satellites in orbit.' },
    'People':       { key: 'people',icon: 'users',    color: '#ff9a45', blurb: 'Population, energy, history and human impact.' },
    'Extras':       { key: 'extras',icon: 'sparkle',  color: '#f472b6', blurb: 'Overlays, base maps and special effects.' },
  };
  const THEME_ORDER = ['Climate Change', 'Human Impacts', 'Natural Disasters', 'Major Events', 'Plate Tectonics', 'Solar System', 'Animals', 'Pollution', 'ClimateBits', 'Renewable Energy'];

  const dtf = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const mtf = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmt = {
    date: (iso) => (iso ? dtf.format(new Date(iso + 'T00:00:00Z')) : ''),
    month: (iso) => (iso ? mtf.format(new Date(iso + 'T00:00:00Z')) : ''),
    year: (iso) => (iso ? +iso.slice(0, 4) : null),
    grade: (g) => (g ? (g[0] === g[1] ? gl(g[0]) : gl(g[0]) + '–' + gl(g[1])) : ''),
    num: (n) => new Intl.NumberFormat('en-US').format(n),
    coverage(d) {
      if (d.rt) return 'Real-time';
      if (d.t0) {
        const a = +d.t0.slice(0, 4), b = +d.t1.slice(0, 4);
        if (a === b) return d.t0.slice(0, 4);
        return a + '–' + (b >= new Date().getUTCFullYear() + 80 ? b : b);
      }
      return '';
    },
    plural: (n, one, many) => `${fmt.num(n)} ${n === 1 ? one : many || one + 's'}`,
  };
  function gl(n) { return n === 0 ? 'K' : String(n); }

  /* ---------- hydrate ---------- */
  const raw = window.SOS_RAW || [];
  const all = raw.map((r) => {
    const catList = Object.keys(r.cats);
    const subPairs = [];
    const subs = new Set();
    for (const c of catList) for (const s of r.cats[c]) { subPairs.push(c + '/' + s); subs.add(s); }
    const base = r.thumbFull ? null : r.thumb;
    const d = {
      id: r.id, name: r.name, slug: r.slug, url: BASE + '/catalog/datasets/' + r.slug + '/',
      added: r.added, addedTs: Date.parse(r.added + 'T00:00:00Z'), addedYear: +r.added.slice(0, 4),
      thumbSmall: base ? `${BASE}/ftp_mirror/${base}/media/thumbnail_small.jpg` : (r.thumbFull || '').replace('thumbnail_big', 'thumbnail_small').replace(/^\//, BASE + '/'),
      thumbBig: base ? `${BASE}/ftp_mirror/${base}/media/thumbnail_big.jpg` : (r.thumbFull || '').replace(/^\//, BASE + '/'),
      cats: r.cats, catList, cat: catList[0] || 'Extras', subs: [...subs], subPairs,
      themes: r.themes, kw: r.kw, rt: r.rt, audio: r.audio, narrated: r.narrated, sos: r.sos, sosx: r.sosx,
      vars: r.vars, t0: r.t0 || null, t1: r.t1 || null,
      y0: r.t0 ? +r.t0.slice(0, 4) : null, y1: r.t1 ? +r.t1.slice(0, 4) : null,
      grade: r.grade || null, ccc: r.ccc, dci: r.dci, desc: r.desc, more: r.more, kind: r.kind,
    };
    d.hasVariations = d.vars.length > 0;
    d.hay = (d.name + ' ' + d.kw.join(' ') + ' ' + catList.join(' ') + ' ' + d.subs.join(' ') + ' ' + d.themes.join(' ') + ' ' + d.desc).toLowerCase();
    d.nameLc = d.name.toLowerCase();
    d.kwLc = d.kw.map((k) => k.toLowerCase());
    d.tagLc = (catList.join(' ') + ' ' + d.subs.join(' ') + ' ' + d.themes.join(' ')).toLowerCase();
    return d;
  });
  const byId = new Map(all.map((d) => [d.id, d]));
  const bySlug = new Map(all.map((d) => [d.slug, d]));

  /* ---------- static facet inventories ---------- */
  const catCount = {}, subCount = {}, themeCount = {}, kwCount = {}, subByCat = {};
  for (const d of all) {
    for (const c of d.catList) { catCount[c] = (catCount[c] || 0) + 1; for (const s of d.cats[c]) { (subByCat[c] = subByCat[c] || {})[s] = (subByCat[c][s] || 0) + 1; } }
    for (const s of d.subs) subCount[s] = (subCount[s] || 0) + 1;
    for (const t of d.themes) themeCount[t] = (themeCount[t] || 0) + 1;
    for (const k of d.kw) kwCount[k] = (kwCount[k] || 0) + 1;
  }
  const cats = CAT_ORDER.filter((c) => catCount[c]);
  const topKeywords = Object.entries(kwCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => ({ name: k, count: n }));
  const years = all.map((d) => d.addedYear);
  const yearMin = Math.min(...years), yearMax = Math.max(...years);
  const gradeBands = [
    { id: 'k2', label: 'K–2', range: [0, 2] }, { id: '35', label: '3–5', range: [3, 5] },
    { id: '68', label: '6–8', range: [6, 8] }, { id: '912', label: '9–12', range: [9, 12] },
  ];

  /* ---------- search ---------- */
  function tokenize(q) { return (q || '').toLowerCase().split(/[\s,]+/).filter(Boolean); }
  function scoreDataset(d, toks, phrase) {
    let score = 0;
    for (const t of toks) {
      let s = 0;
      const ni = d.nameLc.indexOf(t);
      if (ni === 0) s = 14;
      else if (ni > 0) s = d.nameLc[ni - 1] === ' ' || d.nameLc[ni - 1] === '(' || d.nameLc[ni - 1] === ':' ? 11 : 7;
      if (!s) { for (const k of d.kwLc) { if (k === t) { s = 8; break; } if (k.startsWith(t)) s = Math.max(s, 6); else if (k.includes(t)) s = Math.max(s, 4); } }
      if (!s && d.tagLc.includes(t)) s = 3.5;
      if (!s && d.hay.includes(t)) s = 1.5;
      if (!s) return 0; // every token must match
      score += s;
    }
    if (phrase && toks.length > 1 && d.nameLc.includes(phrase)) score += 10;
    if (d.rt) score += 0.4;
    return score;
  }

  /* ---------- filtering + facet counts ---------- */
  const emptyState = () => ({ q: '', cats: [], subs: [], themes: [], platforms: [], flags: [], kws: [], ccc: [], dci: [], years: null, grade: null, kinds: [], sort: 'az' });
  const has = (arr, v) => arr.indexOf(v) !== -1;

  const tests = {
    cats: (d, s) => !s.cats.length || s.cats.some((c) => d.cats[c]),
    subs: (d, s) => {
      if (!s.subs.length) return true;
      return s.subs.some((x) => {
        if (x.indexOf('/') !== -1) return has(d.subPairs, x);
        if (s.cats.length) return s.cats.some((c) => d.cats[c] && d.cats[c].indexOf(x) !== -1);
        return d.subs.indexOf(x) !== -1;
      });
    },
    themes: (d, s) => !s.themes.length || s.themes.some((t) => has(d.themes, t)),
    platforms: (d, s) => !s.platforms.length || s.platforms.some((p) => d[p]),
    flags: (d, s) => !s.flags.length || s.flags.every((f) => (f === 'vars' ? d.hasVariations : d[f])),
    kws: (d, s) => !s.kws.length || s.kws.every((k) => has(d.kw, k)),
    ccc: (d, s) => !s.ccc.length || s.ccc.some((x) => has(d.ccc, x)),
    dci: (d, s) => !s.dci.length || s.dci.some((x) => has(d.dci, x)),
    years: (d, s) => !s.years || (d.addedYear >= s.years[0] && d.addedYear <= s.years[1]),
    grade: (d, s) => !s.grade || (d.grade && d.grade[0] <= s.grade[1] && d.grade[1] >= s.grade[0]),
    kinds: (d, s) => !s.kinds.length || has(s.kinds, d.kind) || s.kinds.some((k) => k.indexOf(':') === -1 && d.kind.split(':')[0] === k),
  };
  const GROUPS = Object.keys(tests);

  function passes(d, s, skip) {
    for (const g of GROUPS) { if (g !== skip && !tests[g](d, s)) return false; }
    return true;
  }

  function run(state) {
    const s = Object.assign(emptyState(), state || {});
    const toks = tokenize(s.q);
    const phrase = toks.length > 1 ? s.q.trim().toLowerCase() : '';
    const scored = new Map();
    let pool = all;
    if (toks.length) {
      pool = [];
      for (const d of all) { const sc = scoreDataset(d, toks, phrase); if (sc > 0) { scored.set(d.id, sc); pool.push(d); } }
    }
    const items = pool.filter((d) => passes(d, s));
    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
    switch (s.sort) {
      case 'za': items.sort((a, b) => byName(b, a)); break;
      case 'new': items.sort((a, b) => b.addedTs - a.addedTs || byName(a, b)); break;
      case 'old': items.sort((a, b) => a.addedTs - b.addedTs || byName(a, b)); break;
      case 'rt': items.sort((a, b) => b.rt - a.rt || byName(a, b)); break;
      case 'span': items.sort((a, b) => (b.y0 != null ? b.y1 - b.y0 : -1) - (a.y0 != null ? a.y1 - a.y0 : -1) || byName(a, b)); break;
      case 'rel': items.sort((a, b) => (scored.get(b.id) || 0) - (scored.get(a.id) || 0) || byName(a, b)); break;
      default: items.sort(byName);
    }

    // disjunctive facet counts: each group counted with every *other* group applied
    const counts = { cats: {}, subs: {}, subPairs: {}, themes: {}, platforms: { sos: 0, sosx: 0 }, flags: { rt: 0, audio: 0, narrated: 0, vars: 0 }, years: {}, ccc: {}, dci: {}, kinds: {}, grade: {} };
    const inPool = toks.length ? (d) => scored.has(d.id) : () => true;
    for (const d of all) {
      if (!inPool(d)) continue;
      const ok = {};
      let failures = 0, failedGroup = null;
      for (const g of GROUPS) { ok[g] = tests[g](d, s); if (!ok[g]) { failures++; failedGroup = g; } }
      if (failures > 1) continue;
      const pass = (g) => failures === 0 || (failures === 1 && failedGroup === g);
      if (pass('cats')) for (const c of d.catList) counts.cats[c] = (counts.cats[c] || 0) + 1;
      if (pass('subs')) { for (const x of d.subs) counts.subs[x] = (counts.subs[x] || 0) + 1; for (const x of d.subPairs) counts.subPairs[x] = (counts.subPairs[x] || 0) + 1; }
      if (pass('themes')) for (const t of d.themes) counts.themes[t] = (counts.themes[t] || 0) + 1;
      if (pass('platforms')) { if (d.sos) counts.platforms.sos++; if (d.sosx) counts.platforms.sosx++; }
      if (pass('flags')) { if (d.rt) counts.flags.rt++; if (d.audio) counts.flags.audio++; if (d.narrated) counts.flags.narrated++; if (d.hasVariations) counts.flags.vars++; }
      if (pass('years')) counts.years[d.addedYear] = (counts.years[d.addedYear] || 0) + 1;
      if (pass('ccc')) for (const x of d.ccc) counts.ccc[x] = (counts.ccc[x] || 0) + 1;
      if (pass('dci')) for (const x of d.dci) counts.dci[x] = (counts.dci[x] || 0) + 1;
      if (pass('kinds')) { counts.kinds[d.kind] = (counts.kinds[d.kind] || 0) + 1; const fam = d.kind.split(':')[0]; if (fam !== d.kind) counts.kinds[fam] = (counts.kinds[fam] || 0) + 1; }
      if (pass('grade')) { for (const b of gradeBands) if (d.grade && d.grade[0] <= b.range[1] && d.grade[1] >= b.range[0]) counts.grade[b.id] = (counts.grade[b.id] || 0) + 1; }
    }
    return { items, total: all.length, counts, state: s, scores: scored, tokens: toks };
  }

  /* ---------- suggestions + related ---------- */
  function suggest(q, limit = 8) {
    const toks = tokenize(q);
    if (!toks.length) return { datasets: [], keywords: [], cats: [] };
    const phrase = toks.join(' ');
    const ds = [];
    for (const d of all) { const sc = scoreDataset(d, toks, phrase); if (sc > 0) ds.push([sc, d]); }
    ds.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    const last = toks[toks.length - 1];
    const kws = topKeywords.filter((k) => k.name.toLowerCase().includes(last)).slice(0, 6);
    const cs = cats.filter((c) => c.toLowerCase().includes(last));
    return { datasets: ds.slice(0, limit).map((x) => x[1]), keywords: kws, cats: cs, total: ds.length };
  }

  function related(d, n = 6) {
    const A = new Set([...d.kw.map((k) => k.toLowerCase()), ...d.subs.map((s) => 's:' + s), ...d.themes.map((t) => 't:' + t)]);
    const out = [];
    for (const o of all) {
      if (o.id === d.id) continue;
      let s = 0;
      for (const k of o.kw) if (A.has(k.toLowerCase())) s += 2;
      for (const x of o.subs) if (A.has('s:' + x)) s += 1.5;
      for (const t of o.themes) if (A.has('t:' + t)) s += 1.5;
      if (o.cat === d.cat) s += 1;
      if (o.kind === d.kind) s += 2;
      if (s > 0) out.push([s, o]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return out.slice(0, n).map((x) => x[1]);
  }

  /* ---------- playlist (localStorage, shared between concepts) ---------- */
  const PL_KEY = 'sos.concepts.playlist.v1';
  const plListeners = new Set();
  let plIds = [];
  try { plIds = JSON.parse(localStorage.getItem(PL_KEY) || '[]').filter((id) => byId.has(id)); } catch (e) { plIds = []; }
  const plSave = () => { try { localStorage.setItem(PL_KEY, JSON.stringify(plIds)); } catch (e) { /* storage unavailable */ } plListeners.forEach((fn) => fn(plIds.slice())); };
  const playlist = {
    get ids() { return plIds.slice(); },
    get items() { return plIds.map((id) => byId.get(id)).filter(Boolean); },
    get size() { return plIds.length; },
    has: (id) => plIds.indexOf(id) !== -1,
    add(id) { if (!playlist.has(id)) { plIds.push(id); plSave(); } },
    remove(id) { const i = plIds.indexOf(id); if (i !== -1) { plIds.splice(i, 1); plSave(); } },
    toggle(id) { playlist.has(id) ? playlist.remove(id) : playlist.add(id); return playlist.has(id); },
    clear() { plIds = []; plSave(); },
    move(from, to) { if (from === to || from < 0 || to < 0 || from >= plIds.length || to >= plIds.length) return; const [x] = plIds.splice(from, 1); plIds.splice(to, 0, x); plSave(); },
    set(ids) { plIds = ids.filter((id) => byId.has(id)); plSave(); },
    onChange(fn) { plListeners.add(fn); return () => plListeners.delete(fn); },
  };

  /* ---------- text helpers ---------- */
  function highlight(text, tokens) {
    const s = SOS.esc(text);
    if (!tokens || !tokens.length) return s;
    const re = new RegExp('(' + tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    // operate on the escaped string but only on text segments (no tags are present in it)
    return s.replace(re, '<mark>$1</mark>');
  }

  SOS.store = {
    all, byId, bySlug, cats, CAT_META, CAT_ORDER, THEME_ORDER, catCount, subCount, subByCat, themeCount, topKeywords,
    yearMin, yearMax, gradeBands, emptyState, run, suggest, related, tokenize, playlist, highlight, fmt,
    themes: THEME_ORDER.filter((t) => themeCount[t]),
    sorts: [
      { id: 'az', label: 'Name (A–Z)' }, { id: 'za', label: 'Name (Z–A)' }, { id: 'new', label: 'Newest first' },
      { id: 'old', label: 'Oldest first' }, { id: 'rt', label: 'Real-time first' }, { id: 'span', label: 'Longest coverage' },
    ],
    stats: {
      total: all.length, realtime: all.filter((d) => d.rt).length, explorer: all.filter((d) => d.sosx).length,
      sos: all.filter((d) => d.sos).length, audio: all.filter((d) => d.audio).length, narrated: all.filter((d) => d.narrated).length,
      withCoverage: all.filter((d) => d.t0).length, withGrade: all.filter((d) => d.grade).length,
    },
  };
  SOS.fmt = fmt;
})();
