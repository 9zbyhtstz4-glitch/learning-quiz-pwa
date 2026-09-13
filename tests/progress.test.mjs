import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProgress, refresh, recordPresentation, recordAnswer, selectNext, shuffledIndices } from '../progress.js';
const config = { coolingQuestionCount: 30, coolingHours: 24, restingDays: 7 };
const hour = 3600000;
const q = { id: 'a', answerIndex: 2 };

test('初回出題、他問カウント、同一問題は他問に含めない', () => {
  const ps = ['a','b'].map(initialProgress);
  recordPresentation(ps, 'a', 0, config);
  assert.equal(ps[0].state, 'cooling');
  assert.equal(ps[1].seenSinceCount, 0);
  recordPresentation(ps, 'b', 1, config);
  assert.equal(ps[0].seenSinceCount, 1);
  recordPresentation(ps, 'b', 2, config);
  assert.equal(ps[0].seenSinceCount, 2);
  assert.equal(ps[1].seenSinceCount, 0);
});
test('coolingは問数と時間の両条件が必要（境界値）', () => {
  const p = { ...initialProgress('a'), state:'cooling', lastSeenAt:0, seenSinceCount:29 };
  refresh([p], 24*hour, config); assert.equal(p.state, 'cooling');
  p.seenSinceCount = 30;
  refresh([p], 24*hour-1, config); assert.equal(p.state, 'cooling');
  refresh([p], 24*hour, config); assert.equal(p.state, 'due');
});
test('due誤答でstreakのみリセット、正答2回でresting', () => {
  const p = { ...initialProgress('a'), state:'due', lastSeenAt:0, correctStreak:1 };
  recordAnswer([p], q, 0, 1, config);
  assert.equal(p.state, 'due'); assert.equal(p.correctStreak, 0);
  recordAnswer([p], q, 2, 2, config); assert.equal(p.state, 'due');
  recordAnswer([p], q, 2, 3, config); assert.equal(p.state, 'resting');
  assert.deepEqual(p.answerHistory[2], {choiceIndex:2, correct:true, timestamp:3});
});
test('restingの誤答と7日経過でdue', () => {
  const p = { ...initialProgress('a'), state:'resting', lastSeenAt:0, correctStreak:2 };
  refresh([p], 7*24*hour-1, config); assert.equal(p.state, 'resting');
  refresh([p], 7*24*hour, config); assert.equal(p.state, 'due');
  p.state = 'resting';
  recordAnswer([p], q, 1, 1, config); assert.equal(p.state, 'due'); assert.equal(p.correctStreak,0);
});
test('出題前の時間判定はlastSeenAt更新で失われない', () => {
  const p = {...initialProgress('a'),state:'resting',lastSeenAt:0};
  recordPresentation([p], 'a', 7*24*hour, config);
  assert.equal(p.state, 'due'); assert.equal(p.lastSeenAt,7*24*hour);
});
test('優先順位と全問cooling時の待機', () => {
  const ps = ['a','b','c','d'].map(initialProgress);
  ps[0].state='resting'; ps[1].state='due'; ps[3].state='cooling';
  assert.equal(selectNext(ps),'c'); ps[2].state='cooling';
  assert.equal(selectNext(ps),'b'); ps[1].state='cooling';
  assert.equal(selectNext(ps),'a'); ps[0].state='cooling';
  assert.equal(selectNext(ps),null);
});
test('分野の絞り込みは対象内で優先順位を保ち、対象外の状態に触れない', () => {
  const ps = ['a','b','c','d'].map(initialProgress);
  ps[0].state='due'; ps[1].state='resting'; ps[2].state='cooling';   // dは他分野のunseen
  const before = JSON.stringify(ps);
  const field = new Set(['a','b','c']);
  assert.equal(selectNext(ps), 'd');            // 絞らなければunseenのdが最優先
  assert.equal(selectNext(ps, field), 'a');     // 分野内ではdue > resting
  ps[0].state='cooling';
  assert.equal(selectNext(ps, field), 'b');
  ps[1].state='cooling';
  assert.equal(selectNext(ps, field), null);    // 分野内は全部coolingで待機
  assert.equal(selectNext(ps), 'd');            // 他の分野にはまだ出題できる
  ps[0].state='due'; ps[1].state='resting';
  assert.equal(JSON.stringify(ps), before);     // 選ぶだけで進捗は変わらない
});
test('cooling用語へ再遷移・回答でき、履歴を保存', () => {
  const ps = ['a','b'].map(initialProgress);
  recordPresentation(ps,'a',0,config); recordPresentation(ps,'b',1,config);
  recordPresentation(ps,'a',2,config); recordAnswer(ps,q,2,3,config);
  assert.equal(ps[0].state,'cooling'); assert.equal(ps[0].answerHistory.length,1);
  assert.equal(ps[1].seenSinceCount,1);
});
test('短縮設定でdueへ進める', () => {
  const c={...config,coolingQuestionCount:1,coolingHours:0};
  const ps=['a','b'].map(initialProgress);
  recordPresentation(ps,'a',0,c); recordPresentation(ps,'b',1,c);
  assert.equal(ps[0].state,'due');
});
test('シャッフルは元のインデックスを保ち6通りを生成', () => {
  const orders=new Set();
  for(const a of [0,.34,.67]) for(const b of [0,.5]) {
    const values=[a,b]; const order=shuffledIndices(()=>values.shift());
    assert.deepEqual([...order].sort(),[0,1,2]); orders.add(order.join(','));
  }
  assert.equal(orders.size,6);
});
