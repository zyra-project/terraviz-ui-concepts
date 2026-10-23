// Checks which thumbnail_small.jpg URLs exist (HEAD). Usage: node src/tools/check-thumbs.js
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'src', 'raw', 'catalog.json'), 'utf8'));
const results = {};
const queue = cat.slice();
let done = 0;
async function worker() {
  while (queue.length) {
    const d = queue.shift();
    const big = d.thumbnailBig || '';
    const small = big.replace('thumbnail_big', 'thumbnail_small');
    try {
      const r = await fetch('https://sos.noaa.gov' + small, { method: 'HEAD' });
      const len = +r.headers.get('content-length') || 0;
      results[d.slug] = { small: r.status, len };
    } catch (e) { results[d.slug] = { small: 0, len: 0 }; }
    done++;
  }
}
(async () => {
  await Promise.all(Array.from({ length: 10 }, worker));
  const bad = Object.entries(results).filter(([, v]) => v.small !== 200);
  const lens = Object.values(results).map((v) => v.len).filter(Boolean).sort((a, b) => a - b);
  console.log('checked', done, 'missing small:', bad.length, bad.slice(0, 30).map(([k]) => k));
  console.log('small size min/med/max', lens[0], lens[lens.length >> 1], lens[lens.length - 1]);
  fs.writeFileSync(path.join(root, 'src', 'raw', 'thumbs-small.json'), JSON.stringify(results));
})();
