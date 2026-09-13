import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_LABELS, fieldOptions } from '../fields.js';

const q = (id, fieldId) => ({ id, fieldId });

test('問題に使われている分野だけを、対応表の順に問題数つきで返す', () => {
  const options = fieldOptions([q('1', 'evaluation'), q('2', 'llm'), q('3', 'evaluation'), q('4', 'security')]);
  assert.deepEqual(options, [
    { id: 'llm', count: 1, label: 'LLM全般' },
    { id: 'evaluation', count: 2, label: '評価' },
    { id: 'security', count: 1, label: 'セキュリティ' },
  ]);
});

test('対応表にない分野はIDを出さず、末尾に通し番号つきの仮の名前で並べる', () => {
  const options = fieldOptions([q('1', 'zeta-new'), q('2', 'llm'), q('3', 'alpha-new')]);
  assert.deepEqual(options.map(o => o.id), ['llm', 'alpha-new', 'zeta-new']);
  assert.deepEqual(options.slice(1).map(o => o.label), ['名称未設定の分野1', '名称未設定の分野2']);
  for (const o of options) assert.ok(!o.label.includes(o.id), `${o.id} が表示名に含まれている`);
});

test('現在のdata.jsonの分野はすべて日本語の表示名を持つ', () => {
  const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url), 'utf8'));
  const missing = [...new Set(data.questions.map(x => x.fieldId))].filter(id => !Object.hasOwn(FIELD_LABELS, id));
  assert.deepEqual(missing, []);
  const total = fieldOptions(data.questions).reduce((n, o) => n + o.count, 0);
  assert.equal(total, data.questions.length);
});
