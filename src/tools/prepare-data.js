// Builds src/generated/catalog.js and src/generated/assets.js from the raw NOAA SOS data + NASA GIBS imagery.
// Usage (from project root): node src/tools/prepare-data.js
const fs = require('fs');
const path = require('path');
const { classify } = require('./classify');

const root = path.resolve(__dirname, '..', '..');
const rawDir = path.join(root, 'src', 'raw');
const genDir = path.join(root, 'src', 'generated');
fs.mkdirSync(genDir, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(rawDir, 'catalog.json'), 'utf8'));
const descs = JSON.parse(fs.readFileSync(path.join(rawDir, 'descriptions.json'), 'utf8'));

/* ---------- helpers ---------- */
const decode = (s) =>
  String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

function cutSentence(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  // prefer a sentence boundary in the last 45% of the window
  const m = slice.match(/^(.*[.!?])\s+[^.!?]*$/s);
  if (m && m[1].length > max * 0.55) return m[1];
  const sp = slice.lastIndexOf(' ');
  return slice.slice(0, sp > 0 ? sp : max).replace(/[,;:\-–—]$/, '') + '…';
}

/* ---------- build slim records ---------- */
const thumbRe = /^\/ftp_mirror\/(.+)\/media\/thumbnail_big\.jpg$/;
const out = [];
let oddThumbs = 0;
for (const d of catalog) {
  const parts = descs[d.slug] || [];
  const full = parts.join(' ').replace(/\s+/g, ' ').trim();
  const desc = cutSentence(full, 230);
  const consumed = desc.endsWith('…') ? desc.length - 1 : desc.length;
  const rest = full.slice(consumed).trim();
  const more = rest ? cutSentence(rest, 520) : '';

  const m = thumbRe.exec(d.thumbnailBig || '');
  if (!m) oddThumbs++;
  const ngss = d.ngss || {};
  const rec = {
    id: d.id,
    name: decode(d.name),
    slug: d.slug,
    added: (d.dateAdded || '').slice(0, 10),
    thumb: m ? m[1] : null,
    thumbFull: m ? null : d.thumbnailBig,
    cats: d.categories || {},
    themes: d.themes || [],
    kw: (d.keywords || []).map(decode),
    rt: d.isRealtime ? 1 : 0,
    audio: d.hasAudio ? 1 : 0,
    narrated: d.isNarratedMovie ? 1 : 0,
    sos: d.isSos ? 1 : 0,
    sosx: d.isSosx ? 1 : 0,
    vars: (d.variations || []).map((v) => decode(v.name)),
    t0: d.startDate ? d.startDate.slice(0, 10) : null,
    t1: d.endDate ? d.endDate.slice(0, 10) : null,
    grade: d.gradeRange || null,
    ccc: (ngss.crossCuttingConcepts || []).map((x) => x.title),
    dci: (ngss.disciplinaryCoreIdeas || []).map((x) => x.title),
    desc,
    more,
    kind: classify({ ...d, name: decode(d.name) }),
  };
  if (!rec.thumbFull) delete rec.thumbFull;
  if (!rec.t0) { delete rec.t0; delete rec.t1; }
  if (!rec.grade) delete rec.grade;
  out.push(rec);
}

// stats
const kindCount = {};
for (const r of out) kindCount[r.kind] = (kindCount[r.kind] || 0) + 1;
console.log('records', out.length, 'odd thumbs', oddThumbs);
console.log('kinds', Object.entries(kindCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join('  '));
fs.writeFileSync(path.join(genDir, 'kinds-report.txt'),
  Object.keys(kindCount).sort().map((k) => `== ${k} (${kindCount[k]})\n` + out.filter((r) => r.kind === k).map((r) => '   ' + r.name).join('\n')).join('\n\n'));

const json = JSON.stringify(out);
fs.writeFileSync(path.join(genDir, 'catalog.js'), 'window.SOS_RAW=' + json + ';\n');
console.log('catalog.js bytes', json.length);

/* ---------- assets ---------- */
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(rawDir, file)).toString('base64');
const assets = {
  relief: b64('relief2048.jpg', 'image/jpeg'),
  mask: b64('landwater2048.png', 'image/png'),
  lights: b64('lights1024.jpg', 'image/jpeg'),
};
fs.writeFileSync(path.join(genDir, 'assets.js'), 'window.SOS_ASSETS=' + JSON.stringify(assets) + ';\n');
console.log('assets.js bytes', fs.statSync(path.join(genDir, 'assets.js')).size);
