// 分野IDと画面に出す日本語名。並び順は分野選択シートの表示順になる。
// 分野IDそのものは画面に出さない(design-tokens.md 4.6節)。新しい分野IDを使ったらここに追加する。
// tools/audit-data.cjs が各行を読んで表示名のない分野IDを警告するため、1行に `'id': '表示名',` の形を保つこと。
export const FIELD_LABELS = {
  'llm': 'LLM全般',
  'llm-basics': 'LLMの基礎',
  'prompting': 'プロンプト設計',
  'llm-parameters': 'パラメータ設定',
  'llm-reasoning': '推論と思考',
  'llm-techniques': '応用手法',
  'llm-performance': '性能と効率化',
  'data-formats': 'データ形式',
  'evaluation': '評価',
  'ai-safety': 'AIの安全性',
  'security': 'セキュリティ',
};

// 問題に実際に使われている分野だけを、表示名・問題数つきで返す。
// 対応表にない分野は末尾に並べ、IDを出さずに通し番号つきの仮の名前にする。
export function fieldOptions(questions) {
  const counts = new Map();
  for (const q of questions) counts.set(q.fieldId, (counts.get(q.fieldId) ?? 0) + 1);
  const order = Object.keys(FIELD_LABELS);
  const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
  let unnamed = 0;
  return [...counts]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([id, count]) => ({ id, count, label: Object.hasOwn(FIELD_LABELS, id) ? FIELD_LABELS[id] : `名称未設定の分野${++unnamed}` }));
}
