// Minimal static file server for previewing the concepts (no dependencies).
// Usage: node src/tools/serve.js [port] [rootDir]
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = +process.argv[2] || 5183;
const root = path.resolve(process.argv[3] || path.join(__dirname, '..', '..'));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!err && st.isDirectory()) { res.writeHead(302, { Location: rel + '/' }); return res.end(); }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 ' + rel);
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on http://127.0.0.1:' + port));
