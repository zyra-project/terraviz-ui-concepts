# SOS Catalog — 10 UI/UX concepts (working notes)

Goal: redesign https://sos.noaa.gov/catalog/datasets/ as 10 standalone HTML concepts (search / filter / categorise / sort / view, 2D + 3D globe, themes + layouts).
Real data: 528 datasets from `catalog.json` + descriptions crawled from dataset pages (see src/raw). Thumbnails hot-linked from sos.noaa.gov (`thumbnail_small.jpg` exists for all).

## Build / preview
- `node src/build.js [prefix...]` inlines `src/shared/*` + generated data into `src/concepts/*.html` → `concepts/*.html` (files starting `_` → `dev/`).
- Preview server: `preview_start name=concepts` (node static server, port 5183; python http.server CANNOT see this path — Store-Python AppData virtualization).
- The Browser pane is hidden → requestAnimationFrame does not fire and the animation clock is frozen. Add `?rafshim` to any page URL: timer-driven rAF **and** transitions/animations/smooth-scroll switched off (otherwise `visibility`/`opacity` transitions never finish and panels look blank). Screenshots need a short `wait` first.
- `dev/engine.html?rafshim&sheet=sst,clouds,body:moon&cols=3&mode=3d|2d&proj=natural&style=dots|paper|flat|duo&wrap=0` = contact-sheet of mini globes.
- `dev/frame.html?c=02-atlas&w=1280&h=800&v=1&q=layout=split&theme=paper#slug` shows a concept in an iframe of the requested CSS size scaled to the window (true desktop layouts in a small pane). Change `v` when re-checking a rebuilt file (the page itself gets cached).

## Shared code (src/shared) — order matters
00-core (utils, geo data, QA hook, `?rafshim`) · 10-store (SOS.store: hydrate, run(state) search/facets/sort, playlist) · 20-layers (SOS.layers: LAYERS ramps/legends, BODIES, overlays, Particles, resolve(d), timeInfo) · 30-shaders (GLSL) · 31-globe (SOS.Globe) · 40-ui (SOS.ui: icon(), thumb(), toast, persist, themeSwitcher, segmented, fitPlaceholders, bindScrollFade) · 50-app (SOS.createApp, SOS.describe, SOS.bindGlobe)
- `fitPlaceholders` (auto-runs): shortens an `<input placeholder>` to whole words + "…" when the field is too narrow (original kept in `data-ph`).
- `bindScrollFade` (auto-runs): `[data-fade]` horizontal strips get an edge fade on whichever side still has content.

### SOS.Globe API
`new SOS.Globe(el,{mode:'3d'|'2d', projection:'equirect'|'natural'|'mercator', wrap, lon, lat, zoom, autoRotate, onView, onHover, onClick, onTime, onReady})`
`themeFromCSS(el)` reads `--g-style(photo|flat|duo|dots) --g-ocean --g-ocean2 --g-land --g-land2 --g-coast --g-coast-a --g-grid --g-grid-a --g-grid-step --g-atmo --g-atmo-a --g-stars --g-light(head|sun|none) --g-exposure --g-sat --g-gamma --g-night --g-lights --g-text --g-halo --g-accent`
`setMode, setProjection, setDataset(d,{fly,dur}), setTime(t), play(bool), setLoop(s), setLayerOpacity, setInsets({l,r,t,b}), flyTo(lon,lat,zoom), zoomBy(f), resetView(), project(), unproject()`
Layer kinds → `SOS.layers.LAYERS` (sst,temp,clouds,precip,aerosol,co2,ice,bathy,veg,chloro,pop,tsunami,ozone,aurora,magnetic,insol,lights,topo,wind,currents,fire,acid,quakes,storms,routes,energy,earth) + bodies (`body:moon` …) + `sky:cmb|milky`.
Layers are ILLUSTRATIVE procedural visuals (not real data) — say so in the UI footer/about.

## Concepts (src/concepts/NN-name.html)
01 Orbit (immersive globe + glass panels, dark) · 02 Atlas (editorial split, paper light, serif) · 03 Mission Control (dense 3-col console, mono) · 04 Gallery (streaming shelves + bento, light vibrant) · 05 Constellation (force graph) · 06 Chronos (timeline/gantt + map) · 07 Pocket (mobile-first bottom sheet) · 08 Portal (classic faceted grid, NOAA blue) · 09 Index (swiss typographic list + hover preview) · 10 Studio (playlist builder/presenter, multi-globe)
Each: 3 themes (data-theme) + 3 layouts (data-layout), responsive to 390px, keyboard accessible. `?theme=` / `?layout=` / `#slug` deep links work everywhere (Constellation also `?group=network|category|theme|year|kind|platform`).

## Testing tips (Browser pane)
- Screenshots lag one frame behind state changes → take a second screenshot (or `wait`). They also time out now and then ("page did not finish rendering") — just retry. If a screenshot looks zoomed/tiny, re-issue `resize_window` with the same size, or use `dev/frame.html`.
- A hash-only navigation (`…#slug` on the same path) does not reload the page; visit another URL first.
- Selectors: avoid generic class names shared between components (a legend `.bar` once collided with Gantt `.bar`). `ui.segmented()` needs `[data-value]`.
- `content-visibility:auto` on rows caused paint artefacts outside the scroll container — don't use it.
- Specificity trap: `html[data-layout=x] .app{grid-template-columns:…}` beats a plain `.app{…}` inside a media query — repeat the layout selector in the responsive rule.

## QA
- `dev/qa.html?mode=all&auto=1` loads every concept × theme/layout (desktop 1360×800) and every layout at 390×780 in an iframe and reports uncaught errors / console.error (collected by `window.__sosErrors`, installed in `00-core.js`), horizontal overflow and missing canvases. Results: `window.__qa`. Add `&hash=hurricane-season-2017` to run the same matrix with a dataset selected.
- The matrix only catches errors/overflow — also eyeball every layout at phone width and at 1280 (see Testing tips). A visual pass found and fixed: clipped/overlapping labels in Constellation's Year/Layer/Platform groupings on phones, Mission Control's Table layout at phone width, crowded time labels in its narrow inspector, Portal's split preview hiding at exactly 1280px, Index's over-tall wall preview card, Gallery's stray category dot, truncated search placeholders, Studio ignoring `#slug`.
- `dev/contrast.html?auto=1[&w=390&h=800]` loads every concept × theme, plain and with a dataset open, and measures WCAG contrast of all on-screen text and placeholders (composited over the real background stack; text over images/gradients/canvas is skipped and counted as "unknown"). Results: `window.__contrast`. Current state: 0 failures at 1280×800 and at 390×800 (60 states each). Palette rule of thumb: tertiary text (`--faint`) must be ≥ 4.5:1 on every surface of its theme; use `color-mix(in srgb, var(--c) 70%, var(--ink))` for category-coloured text on light themes; don't dim text with `opacity` (it silently drops below 4.5:1).
- `dev/a11y.html?auto=1` loads every concept (plain + dataset open) and checks structure: unnamed buttons/links, unlabeled inputs, images without alt, duplicate ids, positive tabindex, dangling aria-* references, lang/title/viewport/h1. Current state: clean. (A hidden `<h1 class="sr-only">` was added where a concept had no visible one.)
- `index.html` (root) is the gallery; hero screenshots live in `assets/shots/NN-name.jpg` (800×500, captured from the concepts themselves).

## Status
- [x] data pipeline, store, layers, engine (3D/2D/morph, bodies), app glue
- [x] concepts 01–10 built (01 Orbit, 02 Atlas, 03 Mission Control, 04 Gallery, 05 Constellation, 06 Chronos, 07 Pocket, 08 Portal, 09 Index, 10 Studio)
- [x] index.html gallery + screenshots
- [x] QA matrix run (90 loads ×2 — plain and with a dataset selected — zero script errors, no horizontal overflow)
- [x] visual pass: every layout at 375px and 1280px, selected-dataset state at 375px
- [x] contrast audit: 0 failures in 120 states (see QA)
