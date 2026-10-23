// Inlines the shared engine/data into each concept template and writes standalone HTML files.
//   node src/build.js            -> builds everything
//   node src/build.js 03 05      -> builds only templates whose file name starts with those prefixes
// Templates live in src/concepts/*.html and use:
//   <!--@SHARED_CSS-->   shared base CSS (reset, thumbs, toast, scrollbars)
//   <!--@SHARED_JS-->    <script> with assets + catalog + engine
// Files starting with "_" are dev pages and are written to ./dev instead of ./concepts.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sharedFiles = ['src/shared/00-core.js', 'src/shared/10-store.js', 'src/shared/20-layers.js', 'src/shared/30-shaders.js', 'src/shared/31-globe.js', 'src/shared/40-ui.js', 'src/shared/50-app.js'];
const sharedJs = ['src/generated/assets.js', 'src/generated/catalog.js', ...sharedFiles].map(read).join('\n');
const sharedCss = read('src/shared/base.css');

const only = process.argv.slice(2);
const dir = path.join(root, 'src', 'concepts');
const outDir = path.join(root, 'concepts');
const devDir = path.join(root, 'dev');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(devDir, { recursive: true });

let built = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html')).sort()) {
  if (only.length && !only.some((p) => f.startsWith(p))) continue;
  let html = fs.readFileSync(path.join(dir, f), 'utf8');
  if (!html.includes('<!--@SHARED_JS-->')) { console.warn('skip (no marker):', f); continue; }
  if (!/rel="icon"/.test(html)) html = html.replace('</title>', () => `</title>\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3CradialGradient id='g' cx='.35' cy='.3'%3E%3Cstop offset='0' stop-color='%23a6dcff'/%3E%3Cstop offset='1' stop-color='%231847b8'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='14' fill='url(%23g)'/%3E%3Cellipse cx='16' cy='16' rx='5.5' ry='14' fill='none' stroke='%23fff' stroke-opacity='.55' stroke-width='1.4'/%3E%3Cpath d='M3 12h26M3 20h26' stroke='%23fff' stroke-opacity='.45' stroke-width='1.4' fill='none'/%3E%3C/svg%3E">`);
  html = html.replace('<!--@SHARED_CSS-->', () => `<style id="sos-base">\n${sharedCss}\n</style>`);
  html = html.replace('<!--@SHARED_JS-->', () => `<script id="sos-shared">\n${sharedJs}\n</script>`);
  const target = path.join(f.startsWith('_') ? devDir : outDir, f.replace(/^_/, ''));
  fs.writeFileSync(target, html);
  built++;
  console.log('built', path.relative(root, target), (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
}
console.log('done,', built, 'file(s)');
