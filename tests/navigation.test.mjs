import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 実際の遷移ハンドラーを実行し、フォールバック時の副作用を検証する。
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function openTerm('), source.indexOf('\nasync function answer('));
function setup(currentId, stackIds, extra = {}) {
  const definition = { textContent: '', hidden: true };
  let saves = 0;
  let renders = 0;
  const context = vm.createContext({
    ...extra,
    termById: new Map([['a', { questionIds: ['A'], shortDefinition: 'Aの定義' }]]),
    questionById: new Map([['A', { type: 'term' }]]),
    current: { questionId: currentId, order: [2, 0, 1], choiceIndex: 2 },
    interruptStack: { stack: stackIds.map(questionId => ({ questionId })), maxDepth: 2 },
    suspendedViews: [], $: () => definition, db: {}, data: { questions: [] },
    updateProgress: async () => { saves++; },
    makeView: questionId => ({ questionId }), render: () => { renders++; },
  });
  vm.runInContext(handler, context);
  return { context, definition, saves: () => saves, renders: () => renders };
}
for (const [name, currentId, stackIds] of [
  ['自己参照 A→A', 'A', []],
  ['循環 A→B→A（上限未到達）', 'B', ['A']],
  ['深さ上限', 'C', ['X', 'B']],
]) {
  test(name + 'は定義だけ表示し画面・スタック・進捗を変更しない', async () => {
    const s = setup(currentId, stackIds);
    const before = JSON.stringify({ current: s.context.current, stack: s.context.interruptStack });
    await s.context.openTerm('a');
    assert.equal(s.definition.textContent, 'Aの定義');
    assert.equal(s.definition.hidden, false);
    assert.equal(s.saves(), 0);
    assert.equal(s.renders(), 0);
    assert.equal(JSON.stringify({ current: s.context.current, stack: s.context.interruptStack }), before);
    assert.equal(s.context.suspendedViews.length, 0);
  });
}
test('循環しない用語遷移は保存・push・表示を継続', async () => {
  const s = setup('B', []);
  await s.context.openTerm('a');
  assert.equal(s.saves(), 1);
  assert.equal(s.renders(), 1);
  assert.equal(s.context.current.questionId, 'A');
  assert.equal(s.context.interruptStack.stack[0].questionId, 'B');
  assert.equal(s.context.suspendedViews[0].choiceIndex, 2);
});
test('分野を絞っていても、他分野の用語問題へ遷移できる', async () => {
  // 遷移先Aを含まない分野を選んだ状態。絞り込みは次の問題の自動選択だけに効く。
  const s = setup('B', [], { selectedField: 'other', allowed: new Set(['B']) });
  await s.context.openTerm('a');
  assert.equal(s.saves(), 1);
  assert.equal(s.context.current.questionId, 'A');
  assert.equal(s.context.interruptStack.stack.length, 1);
});
