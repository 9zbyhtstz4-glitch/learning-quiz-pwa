// 本番データ投入前の点検。data.jsonの必須制約・自己参照マーカー・分布を検査する。
// 使い方: node tools/audit-data.cjs   エラーがあれば終了コード1。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const MARKER = /\{\{term:([^}]+)\}\}/g;

const errors = [];
const warnings = [];
const err = (where, message) => errors.push(`${where} — ${message}`);
const warn = (where, message) => warnings.push(`${where} — ${message}`);
const markers = body => [...String(body).matchAll(MARKER)].map(m => m[1]);

// --- コレクションとID ---
for (const [name, list] of [['questions', data.questions], ['terms', data.terms], ['articles', data.articles]]) {
  if (!Array.isArray(list) || !list.length) { err(name, '配列が空、または配列ではありません。'); continue; }
  const counts = new Map();
  for (const entry of list) {
    if (typeof entry.id !== 'string' || !entry.id) { err(name, 'idが文字列でないエントリがあります。'); continue; }
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  }
  for (const [id, n] of counts) if (n > 1) err(`${name} / ${id}`, `idが${n}件重複しています。`);
}

const questionById = new Map(data.questions.map(q => [q.id, q]));
const termById = new Map(data.terms.map(t => [t.id, t]));
const articleIds = new Set(data.articles.map(a => a.id));

// --- Question ---
for (const q of data.questions) {
  const at = `Question ${q.id}`;
  if (!['term', 'relationship'].includes(q.type)) err(at, `typeが"term"/"relationship"ではありません: ${JSON.stringify(q.type)}`);
  if (!Array.isArray(q.choices)) err(at, 'choicesが配列ではありません。');
  else if (q.choices.length !== 3) err(at, `choicesは3件必要ですが${q.choices.length}件です。`);
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 2)
    err(at, `answerIndexは0〜2の整数が必要ですが ${JSON.stringify(q.answerIndex)} です。`);
  if (typeof q.revealAnswer !== 'boolean') err(at, `revealAnswerは真偽値が必要ですが ${JSON.stringify(q.revealAnswer)} です。`);

  if (!Array.isArray(q.termIds)) err(at, 'termIdsが配列ではありません。');
  else for (const id of q.termIds) if (!termById.has(id)) err(at, `termIdsが存在しない用語を参照しています: ${id}`);

  if (!Array.isArray(q.sourceArticleIds)) err(at, 'sourceArticleIdsが配列ではありません。');
  else for (const id of q.sourceArticleIds) if (!articleIds.has(id)) err(at, `sourceArticleIdsが存在しない記事を参照しています: ${id}`);

  if (typeof q.body !== 'string') err(at, 'bodyが文字列ではありません。');
  else if (Array.isArray(q.termIds)) {
    for (const id of markers(q.body)) if (!q.termIds.includes(id)) err(at, `本文の{{term:${id}}}がtermIdsに含まれていません。`);
  }

  if (typeof q.explanation !== 'string' || !q.explanation) warn(at, 'explanationが空です。回答後の解説が表示されません。');
}

// --- Term ---
for (const t of data.terms) {
  const at = `Term ${t.id}`;
  if (!Array.isArray(t.questionIds) || !t.questionIds.length) err(at, 'questionIdsが空です。用語には最低1件のterm型問題が必要です。');
  else for (const id of t.questionIds) {
    const q = questionById.get(id);
    if (!q) err(at, `questionIdsが存在しない問題を参照しています: ${id}`);
    else if (q.type !== 'term') err(at, `questionIdsはterm型のみ指定できますが ${id} は "${q.type}" です。`);
  }
  for (const id of t.relatedTermIds ?? []) if (!termById.has(id)) err(at, `relatedTermIdsが存在しない用語を参照しています: ${id}`);

  if (!Array.isArray(t.referenceArticleIds)) err(at, 'referenceArticleIdsが配列ではありません。');
  else for (const id of t.referenceArticleIds) if (!articleIds.has(id)) err(at, `referenceArticleIdsが存在しない記事を参照しています: ${id}`);

  if (typeof t.label !== 'string' || !t.label) warn(at, 'labelが空です。用語一覧に"undefined"と表示されます。');
  if (typeof t.shortDefinition !== 'string' || !t.shortDefinition) warn(at, 'shortDefinitionが空です。定義欄に"undefined"と表示されます。');
  if (/[{}]/.test(t.id)) warn(at, 'idに波括弧が含まれます。{{term:id}}記法が認識されず本文にそのまま表示されます。');
}

// --- 7.3 自己参照マーカーの禁止 ---
for (const t of data.terms) {
  for (const id of t.questionIds ?? []) {
    const q = questionById.get(id);
    if (q?.type !== 'term' || typeof q.body !== 'string') continue;
    if (markers(q.body).includes(t.id))
      err(`Question ${q.id}`, `自身が扱う用語の{{term:${t.id}}}が本文にあります(7.3節違反)。タップでshortDefinitionが表示され答えが露出します。`);
  }
}

// --- relationship問題の規約(5.1/5.3節)とpatternTypeの値 ---
const PATTERN_TYPES = ['select-correct', 'select-incorrect', 'select-best'];
for (const q of data.questions) {
  const at = `Question ${q.id}`;
  if (q.type === 'relationship') {
    if (q.revealAnswer === true)
      warn(at, 'relationshipのrevealAnswerがtrueです(5.3節はfalse)。正誤と正解位置が表示され、解説のみで導く方式になりません。');
    if (Array.isArray(q.termIds) && q.termIds.length < 2)
      warn(at, `relationshipのtermIdsが${q.termIds.length}件です(5.1節は2件以上を想定)。扱っている用語を追加してください。`);
  }
  if (!PATTERN_TYPES.includes(q.patternType))
    warn(at, `patternTypeが${JSON.stringify(q.patternType)}です。選択肢の出題形式は${PATTERN_TYPES.join(' / ')}のいずれかにしてください。`);
}

// --- 出題ローテーション(config.jsとの整合) ---
// 行コメントを落としてから読む。config.js冒頭の注釈にも同じキーが書かれているため。
const configSource = fs.readFileSync(path.join(root, 'config.js'), 'utf8').replace(/\/\/.*$/gm, '');
const cooling = Number(configSource.match(/coolingQuestionCount:\s*(\d+)/)?.[1]);
if (Number.isInteger(cooling) && cooling >= data.questions.length) {
  warn('config.js', `coolingQuestionCountが${cooling}、収録問題数が${data.questions.length}件です。` +
    `間に挟める問題が最大${data.questions.length - 1}問のため条件を満たせず、全問回答後に待機中のまま復習が再開しません。` +
    `収録を${cooling + 1}件以上にするか、coolingQuestionCountを${data.questions.length - 1}以下にしてください。`);
}

// --- 分野の表示名(fields.js) ---
// 分野選択シートは、表示名のない分野を「名称未設定の分野」と表示する。fields.jsの `'id': '表示名',` 行を読む。
const fieldLabels = new Map([...fs.readFileSync(path.join(root, 'fields.js'), 'utf8')
  .matchAll(/^\s*'([^']+)':\s*'([^']+)',?\s*$/gm)].map(m => [m[1], m[2]]));
for (const id of new Set(data.questions.map(q => q.fieldId)))
  if (!fieldLabels.has(id)) warn(`fieldId ${id}`, 'fields.jsに日本語の表示名がありません。分野選択では「名称未設定の分野」と表示されます。');

// --- 監査統計 ---
const tally = (list, key) => list.reduce((m, x) => (m[key(x)] = (m[key(x)] ?? 0) + 1, m), {});
const answerCounts = [0, 1, 2].map(i => data.questions.filter(q => q.answerIndex === i).length);
const patternCounts = tally(data.questions, q => q.patternType ?? '未設定');
const typeCounts = tally(data.questions, q => q.type);
const fieldCounts = tally(data.questions, q => q.fieldId);

const line = '-'.repeat(72);
console.log(`${line}\nデータ点検: 問題${data.questions.length}件 / 用語${data.terms.length}件 / 記事${data.articles.length}件\n${line}`);

console.log('\n[ answerIndexの分布 ]');
const expected = data.questions.length / 3;
for (const [i, n] of answerCounts.entries()) {
  const bar = '#'.repeat(n);
  const skewed = data.questions.length >= 9 && (n < expected * 0.5 || n > expected * 1.5);
  console.log(`  ${i}: ${String(n).padStart(3)}件 ${bar}${skewed ? '  <- 偏り' : ''}`);
}
if (data.questions.length >= 9 && answerCounts.some(n => n < expected * 0.5 || n > expected * 1.5))
  warn('answerIndex', `分布が偏っています(期待値 各約${expected.toFixed(1)}件、実際 ${answerCounts.join(' / ')})。` +
    '表示順はシャッフルされるため学習体験には影響しませんが、作問の癖として確認してください。');

console.log('\n[ patternTypeの分布 ]');
for (const [k, n] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(18)} ${String(n).padStart(3)}件`);

console.log('\n[ typeの分布 ]');
for (const [k, n] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(18)} ${String(n).padStart(3)}件`);

console.log('\n[ fieldIdの分布(分野選択の表示名) ]');
for (const [k, n] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(k).padEnd(18)} ${String(n).padStart(3)}件  ${fieldLabels.get(k) ?? '(表示名なし)'}`);

console.log(`\n${line}`);
if (warnings.length) {
  console.log(`\n警告 ${warnings.length}件(投入は可能ですが確認してください)`);
  warnings.forEach((w, i) => console.log(`  ${String(i + 1).padStart(2)}. ${w}`));
}
if (errors.length) {
  console.log(`\nエラー ${errors.length}件(このままでは起動できません)`);
  errors.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)}. ${e}`));
  console.log('\n結果: 失敗');
  process.exit(1);
}
console.log(`\n結果: 成功${warnings.length ? '(警告あり)' : ''}`);
