// デプロイ前に実行。表示バージョンとService Workerのキャッシュ番号を同時更新する。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const sw = fs.readFileSync(swPath, 'utf8');
const label = html.match(/id="app-version" aria-label="バージョン(\d+)">v(\d+)<\/span>/);
const cache = sw.match(/const CACHE = `\$\{PREFIX\}v(\d+)`;/);
if (!label || !cache || label[1] !== label[2] || label[1] !== cache[1]) {
  throw new Error('表示バージョンとキャッシュ番号が一致しません。更新を中止しました。');
}
const next = Number(cache[1]) + 1;
fs.writeFileSync(htmlPath, html.replace(label[0], `id="app-version" aria-label="バージョン${next}">v${next}</span>`));
fs.writeFileSync(swPath, sw.replace(cache[0], 'const CACHE = `${PREFIX}v' + next + '`;'));
console.log(`表示・キャッシュをv${next}に更新しました。両ファイルをデプロイ対象に含めてください。`);
