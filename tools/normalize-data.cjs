// 問題の投入後に実行する整形。何度実行しても結果は変わらない。
// 使い方: node tools/normalize-data.cjs
// - 問題文の {{term:id}} マーカー前後の半角空白を除く。用語ボタン自体に余白があり、空白が残ると間が二重に空く。
// - relatedTermIds を双方向にそろえる。A が B を関連に挙げていれば、B にも A を加える。
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const spaced = [];
for (const q of data.questions) {
  const body = q.body.replace(/ ?(\{\{term:[^}]+\}\}) ?/g, '$1');
  if (body !== q.body) { q.body = body; spaced.push(q.id); }
}

const termById = new Map(data.terms.map(t => [t.id, t]));
const linked = [];
for (const t of data.terms) {
  for (const id of t.relatedTermIds ?? []) {
    const other = termById.get(id);
    if (!other || other === t) continue;
    other.relatedTermIds ??= [];
    if (!other.relatedTermIds.includes(t.id)) { other.relatedTermIds.push(t.id); linked.push(`${other.id} → ${t.id}`); }
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`マーカー前後の空白を除いた問題: ${spaced.length}件${spaced.length ? `(${spaced.join(', ')})` : ''}`);
console.log(`追加した逆向きの関連: ${linked.length}件`);
linked.forEach(l => console.log(`  ${l}`));
