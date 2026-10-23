/* ==========================================================================
   SOS Catalog Concepts — UI helpers
   Icon set (24px stroke icons), thumbnails with graceful fallback, tiny DOM utils
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;
  const { esc } = SOS;

  /* ---------- icons: inner SVG markup, 24×24, stroke = currentColor ---------- */
  const I = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="18" r=".9" fill="currentColor"/>',
    rows: '<rect x="3.5" y="4" width="17" height="6" rx="1.6"/><rect x="3.5" y="14" width="17" height="6" rx="1.6"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>',
    map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5l-6-2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    cube: '<path d="m12 2.8 8 4.5v9.4l-8 4.5-8-4.5V7.3l8-4.5z"/><path d="m4 7.3 8 4.6 8-4.6M12 12v9.2"/>',
    layers: '<path d="m12 3 9 4.8-9 4.8-9-4.8L12 3z"/><path d="m3 12.2 9 4.8 9-4.8"/><path d="m3 16.6 9 4.8 9-4.8"/>',
    play: '<path d="M7.5 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1l-11-6.8a.6.6 0 0 0-.9.5z" fill="currentColor"/>',
    pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    skipback: '<path d="M6 5v14M19 5.8v12.4a.5.5 0 0 1-.8.4L9.4 12.4a.5.5 0 0 1 0-.8l8.8-6.2a.5.5 0 0 1 .8.4z"/>',
    skipfwd: '<path d="M18 5v14M5 5.8v12.4a.5.5 0 0 0 .8.4l8.8-6.2a.5.5 0 0 0 0-.8L5.8 5.4a.5.5 0 0 0-.8.4z"/>',
    chevdown: '<path d="m6 9.5 6 6 6-6"/>', chevup: '<path d="m18 14.5-6-6-6 6"/>', chevleft: '<path d="m14.5 6-6 6 6 6"/>', chevright: '<path d="m9.5 6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    target: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
    rotate: '<path d="M20.5 12A8.5 8.5 0 1 1 17.9 6"/><path d="M20.5 3.5v5h-5"/>',
    expand: '<path d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15"/>',
    shrink: '<path d="M3.5 9H9V3.5M20.5 9H15V3.5M3.5 15H9v5.5M20.5 15H15v5.5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    tag: '<path d="M20.4 13.1 13.1 20.4a2 2 0 0 1-2.8 0L3.5 13.6V3.5h10.1l6.8 6.8a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
    bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1z"/>',
    star: '<path d="m12 3.3 2.7 5.5 6 .9-4.4 4.2 1 6L12 17l-5.3 2.9 1-6L3.3 9.7l6-.9L12 3.3z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2"/><circle cx="12" cy="7.9" r=".6" fill="currentColor"/>',
    sort: '<path d="M7.5 4v16M3.5 16l4 4 4-4M16.5 20V4M12.5 8l4-4 4 4"/>',
    zap: '<path d="M13 2.5 4.5 13.6h6.2L9.9 21.5l8.6-11.2h-6.3L13 2.5z"/>',
    volume: '<path d="M4 9.5v5h3.6l4.9 3.8V5.7L7.6 9.5H4z"/><path d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/>',
    film: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M7.5 4v16M16.5 4v16M3.5 8.5h4M3.5 12h4M3.5 15.5h4M16.5 8.5h4M16.5 12h4M16.5 15.5h4"/>',
    cap: '<path d="m2.5 9 9.5-4.6L21.5 9 12 13.6 2.5 9z"/><path d="M6 11.2v4.3c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.3M21.5 9v5.5"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.3A8 8 0 1 1 9.7 4a6.4 6.4 0 0 0 10.3 10.3z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.7-.8 1.7-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a3.5 3.5 0 0 0 3.5-3.5c0-4.1-3.8-7.7-8.5-7.7z"/><circle cx="7.6" cy="11.2" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="7.4" r="1" fill="currentColor" stroke="none"/>',
    panel: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M9.5 4v16"/>',
    panelr: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M14.5 4v16"/>',
    paneb: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M3.5 14.5h17"/>',
    split: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M12 4v16"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="m8.1 10.9 7.8-3.8M8.1 13.1l7.8 3.8"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9V6.5zM15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5zM9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5zM15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5z"/><path d="M9 9h6v6H9z"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1z"/>',
    drop: '<path d="M12 3.2s6 6 6 10.3a6 6 0 0 1-12 0C6 9.2 12 3.2 12 3.2z"/>',
    wind: '<path d="M3.5 9h10.2a2.8 2.8 0 1 0-2.8-2.8M3.5 14h15.2a2.8 2.8 0 1 1-2.8 2.8M3.5 19h7"/>',
    mountain: '<path d="m2.8 19.5 6.2-11 4 6.2 2.6-3.6 5.6 8.4H2.8z"/>',
    snow: '<path d="M12 3v18M4.6 7.5l14.8 9M4.6 16.5l14.8-9M9 4.6l3 2.2 3-2.2M9 19.4l3-2.2 3 2.2"/>',
    users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0M16 5.5a3.3 3.3 0 0 1 0 6M18 14.4a6.2 6.2 0 0 1 3.2 5.1"/>',
    planet: '<circle cx="12" cy="12" r="4.8"/><path d="M19.8 9.2c1.8.9 2.1 2.1 1.1 3.5-1.4 2-5.5 3.1-9.8 2.7M4.2 14.8C2.4 13.9 2.1 12.7 3.1 11.3c1.4-2 5.5-3.1 9.8-2.7"/>',
    sparkle: '<path d="m11 3.5 1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7L11 3.5z"/><path d="m18.5 14.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
    arrowright: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>', arrowleft: '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>', arrowup: '<path d="M12 19.5v-15M6 10.5l6-6 6 6"/>', arrowdown: '<path d="M12 4.5v15M6 13.5l6 6 6-6"/>',
    arrowur: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l.9 13a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13M10 10.5v6M14 10.5v6"/>',
    grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
    network: '<circle cx="6" cy="6.5" r="2.4"/><circle cx="18" cy="8" r="2.4"/><circle cx="11.5" cy="18" r="2.4"/><path d="m8.4 6.8 7.2.8M7.3 8.5l3.1 7.3M16.7 10.2l-3.9 6"/>',
    timeline: '<path d="M3.5 6h9M7.5 12h13M3.5 18h7"/><circle cx="15.5" cy="6" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="14" cy="18" r="1.6"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2L3.5 8.4"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
    book: '<path d="M3.5 5.5c3-1.4 6-1.2 8.5 1v13c-2.5-2.2-5.5-2.4-8.5-1v-13zM20.5 5.5c-3-1.4-6-1.2-8.5 1v13c2.5-2.2 5.5-2.4 8.5-1v-13z"/>',
    link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
    pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.9A5.6 5.6 0 0 0 6.9 9a4.8 4.8 0 0 0 .1 9.5z"/>',
    thermo: '<path d="M10 14.2V5.5a2 2 0 0 1 4 0v8.7a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
    columns: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M9.2 4v16M14.8 4v16"/>',
    quad: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/><path d="M12 4v16M3.5 12h17"/>',
    single: '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/>',
  };
  const icon = (name, size = 18, cls = '') =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${I[name] || I.dot}</svg>`;

  /* ---------- thumbnails ---------- */
  // Real thumbnails are lazy-loaded from sos.noaa.gov; a category-tinted "mini planet" is the placeholder/fallback.
  function thumbFallbackStyle(d) {
    const layer = SOS.layers.resolve(d);
    const a = layer.accent || (SOS.store.CAT_META[d.cat] || {}).color || '#4f9dff';
    const h = SOS.hashStr(d.slug) % 360;
    return `background: radial-gradient(circle at 34% 30%, ${SOS.mixHex(a, '#ffffff', 0.35)} 0%, ${a} 38%, ${SOS.mixHex(a, '#000000', 0.7)} 100%);`;
  }
  /** returns html for a circular/rect thumbnail with onerror fallback; sizes: 'small' | 'big' */
  function thumb(d, { size = 'small', cls = '', alt = '', eager = false } = {}) {
    const src = size === 'big' ? d.thumbBig : d.thumbSmall;
    return `<span class="thumb ${cls}" style="${thumbFallbackStyle(d)}"><img src="${esc(src)}" alt="${esc(alt)}" ${eager ? '' : 'loading="lazy"'} decoding="async" draggable="false" onload="this.classList.add('is-in')" onerror="if(!this.dataset.f&&${size === 'small' ? 'true' : 'false'}){this.dataset.f=1;this.src='${esc(d.thumbBig)}'}else{this.remove()}"></span>`;
  }
  const THUMB_CSS = `.thumb{position:relative;display:block;overflow:hidden;background-size:cover;isolation:isolate}
.thumb>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease}
.thumb>img.is-in{opacity:1}`;

  /* ---------- small DOM helpers ---------- */
  function html(strings, ...vals) { return strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), ''); }
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') n.className = attrs[k]; else if (k === 'html') n.innerHTML = attrs[k]; else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
    if (children) [].concat(children).forEach((c) => n.append(c));
    return n;
  }
  function on(root, type, selector, fn) {
    root.addEventListener(type, (e) => { const t = e.target.closest(selector); if (t && root.contains(t)) fn(e, t); });
  }
  function toast(msg, { ms = 2200, host = document.body } = {}) {
    let t = document.querySelector('.sos-toast');
    if (!t) { t = document.createElement('div'); t.className = 'sos-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); host.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), ms);
  }
  function persist(key, fallback) {
    let v = fallback;
    try { const s = localStorage.getItem(key); if (s != null) v = JSON.parse(s); } catch (e) { /* ignore */ }
    return { get: () => v, set: (x) => { v = x; try { localStorage.setItem(key, JSON.stringify(x)); } catch (e) { /* ignore */ } } };
  }
  /** apply a CSS var group on <html>; persists the choice */
  function themeSwitcher({ key, themes, attr = 'data-theme', onChange }) {
    const p = persist('sos.concept.' + key, themes[0].id);
    const valid = (id) => themes.some((t) => t.id === id);
    const apply = (id, silent) => { if (!valid(id)) id = themes[0].id; document.documentElement.setAttribute(attr, id); p.set(id); if (!silent && onChange) onChange(id); };
    const q = new URLSearchParams(location.search).get(attr.replace('data-', ''));
    apply(q && valid(q) ? q : p.get(), true);
    return { apply, get: () => document.documentElement.getAttribute(attr), themes };
  }
  /** wire a roving segmented control: buttons with [data-value]; returns setter */
  function segmented(root, onPick) {
    const btns = [...root.querySelectorAll('[data-value]')];
    const set = (v) => btns.forEach((b) => { const on = b.dataset.value === String(v); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b && root.contains(b)) { set(b.dataset.value); onPick(b.dataset.value, b); } });
    return set;
  }
  /** format a [0,1] time to dataset-specific label */
  const timeLabel = (d, t, layer) => SOS.layers.timeInfo(d, layer).label(t);

  /** Keep placeholders from being clipped mid-word: when the full text does not fit its input, fall back to a shorter
   *  whole-word version ending in an ellipsis. Runs on load, on resize and whenever an input changes size. */
  const PH_TAIL = /^(\d[\d,.]*|—|–|-|try|e\.g\.|eg|or|and|like|as|for|in|of|the|a)$/i;
  function fitPlaceholders(root) {
    root = root || document;
    const cv = document.createElement('canvas').getContext('2d');
    const fit = (inp) => {
      const full = inp.getAttribute('data-ph') || inp.getAttribute('placeholder') || '';
      if (!full) return;
      if (!inp.hasAttribute('data-ph')) inp.setAttribute('data-ph', full);
      const cs = getComputedStyle(inp);
      const avail = inp.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 2;
      if (avail <= 0) return;
      cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const ls = parseFloat(cs.letterSpacing) || 0;
      const w = (s) => cv.measureText(s).width + ls * s.length;
      let out = full;
      if (w(full) > avail) {
        const words = full.split(/\s+/); out = '';
        while (words.length > 1) {
          words.pop();
          while (words.length > 1 && PH_TAIL.test(words[words.length - 1].replace(/[“”"',]/g, ''))) words.pop();
          const cand = words.join(' ').replace(/[\s,;:—–-]+$/, '') + '…';
          if (w(cand) <= avail) { out = cand; break; }
        }
        if (!out) out = words[0].replace(/[\s,;:—–-]+$/, '') + '…';
      }
      if (inp.getAttribute('placeholder') !== out) inp.setAttribute('placeholder', out);
    };
    const all = () => [...root.querySelectorAll('input[placeholder],input[data-ph]')];
    const run = () => all().forEach(fit);
    if (window.ResizeObserver) { const ro = new ResizeObserver((es) => es.forEach((e) => fit(e.target))); all().forEach((i) => ro.observe(i)); }
    run(); addEventListener('resize', run); addEventListener('load', run);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
    return run;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fitPlaceholders()); else fitPlaceholders();

  /** [data-fade] strips get a soft fade on whichever side still has content to scroll to (re-checked on scroll, resize and DOM changes) */
  function bindScrollFade() {
    const upd = (el) => { const max = el.scrollWidth - el.clientWidth, x = el.scrollLeft; el.style.setProperty('--fade-l', x > 2 ? '26px' : '0px'); el.style.setProperty('--fade-r', max - x > 2 ? '26px' : '0px'); };
    const run = () => document.querySelectorAll('[data-fade]').forEach(upd);
    document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.nodeType === 1 && t.hasAttribute('data-fade')) upd(t); }, true);
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(run, 40); };
    if (window.MutationObserver) new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('resize', later); addEventListener('load', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    later(); return run;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindScrollFade); else bindScrollFade();

  SOS.ui = { icon, icons: I, thumb, thumbFallbackStyle, THUMB_CSS, html, el, on, toast, persist, themeSwitcher, segmented, timeLabel, fitPlaceholders, bindScrollFade };
})();
