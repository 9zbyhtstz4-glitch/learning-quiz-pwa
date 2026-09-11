// 開発確認用。配信物にNode.jsは不要。外部依存なし。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  // サブディレクトリ配信の確認にも対応。
  if (relative === '/quiz') { res.writeHead(302, { Location: '/quiz/' }).end(); return; }
  if (relative.startsWith('/quiz/')) relative = relative.slice(5);
  const file = path.resolve(root, '.' + (relative.endsWith('/') ? relative + 'index.html' : relative));
  if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(p => p.startsWith('.'))) {
    res.writeHead(403).end(); return;
  }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  });
}).listen(8080, '127.0.0.1', () => console.log('http://localhost:8080/quiz/'));
