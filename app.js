import { config } from './config.js';
import { refresh, recordPresentation, recordAnswer, selectNext, shuffledIndices } from './progress.js';
import { openDatabase, updateProgress } from './db.js';

const $ = id => document.getElementById(id);
let data, db, current = null, busy = false;
// schemaのstackはIDのみ。画面状態は別の配列で同じ深さに保存する。
const interruptStack = { stack: [], maxDepth: config.maxDepth };
const suspendedViews = [];
const questionById = new Map();
const termById = new Map();

function button(text, action, className = '') {
  const el = document.createElement('button');
  el.textContent = text;
  el.className = className;
  el.addEventListener('click', () => run(action));
  return el;
}

async function run(action) {
  if (busy) return;
  busy = true;
  $('error').hidden = true;
  try { await action(); }
  catch (error) {
    $('error').textContent = `処理を完了できませんでした。再度お試しください。${error.message}`;
    $('error').hidden = false;
  } finally { busy = false; }
}

function makeView(id) {
  return { questionId: id, order: shuffledIndices(), choiceIndex: null, waiting: false };
}

async function nextQuestion() {
  if (interruptStack.stack.length) return;
  const id = await updateProgress(db, data.questions, records => {
    const now = Date.now();
    refresh(records, now, config);
    const id = selectNext(records);
    if (id) recordPresentation(records, id, now, config);
    return id;
  });
  if (id) current = makeView(id);
  else if (current) current.waiting = true;
  else {
    // セッション復元ではない。全問coolingで再起動した時の閲覧専用の問題文。
    current = { ...makeView(data.questions[0].id), waiting: true, readOnly: true };
  }
  render();
}

async function openTerm(id) {
  const term = termById.get(id);
  const target = term.questionIds.find(id => questionById.get(id)?.type === 'term');
  if (target === current.questionId ||
      interruptStack.stack.some(entry => entry.questionId === target) ||
      interruptStack.stack.length >= interruptStack.maxDepth) {
    $('definition').textContent = term.shortDefinition;
    $('definition').hidden = false;
    return;
  }
  await updateProgress(db, data.questions, records => {
    recordPresentation(records, target, Date.now(), config);
  });
  interruptStack.stack.push({ questionId: current.questionId });
  suspendedViews.push(current);
  current = makeView(target);
  render();
}

async function answer(index) {
  if (current.choiceIndex !== null || current.readOnly) return;
  const question = questionById.get(current.questionId);
  await updateProgress(db, data.questions, records => {
    recordAnswer(records, question, index, Date.now(), config);
  });
  current.choiceIndex = index;
  render(false);
}

function goBack() {
  if (!interruptStack.stack.length || current.choiceIndex === null) return;
  interruptStack.stack.pop();
  current = suspendedViews.pop();
  render();
}

function render(focus = true) {
  const q = questionById.get(current.questionId);
  $('question').hidden = false;
  $('waiting').hidden = !current.waiting;
  $('definition').hidden = true;
  $('meta').textContent = `${q.type === 'term' ? '用語問題' : '関係性問題'} · ${q.id} · 中断 ${interruptStack.stack.length} / ${interruptStack.maxDepth}`;
  $('body').replaceChildren();
  let end = 0;
  for (const match of q.body.matchAll(/\{\{term:([^}]+)\}\}/g)) {
    $('body').append(document.createTextNode(q.body.slice(end, match.index)));
    const term = termById.get(match[1]);
    $('body').append(button(term.label, () => openTerm(term.id), 'term'));
    end = match.index + match[0].length;
  }
  $('body').append(document.createTextNode(q.body.slice(end)));
  $('choices').replaceChildren();
  for (const index of current.order) {
    const el = button(q.choices[index], () => answer(index));
    el.disabled = current.choiceIndex !== null || !!current.readOnly;
    el.setAttribute('aria-pressed', String(current.choiceIndex === index));
    $('choices').append(el);
  }
  $('feedback').replaceChildren();
  if (current.choiceIndex !== null) {
    if (q.revealAnswer) {
      const result = document.createElement('p');
      if (q.type === 'term') result.className = `result result-${current.choiceIndex === q.answerIndex ? 'success' : 'danger'}`;
      result.textContent = `${current.choiceIndex === q.answerIndex ? '正解です。' : '正解を確認しましょう。'} 正解：${q.choices[q.answerIndex]}`;
      $('feedback').append(result);
    }
    const explanation = document.createElement('p');
    explanation.className = 'explanation';
    explanation.textContent = q.explanation;
    $('feedback').append(explanation);
  }
  $('back').hidden = !interruptStack.stack.length;
  $('back').disabled = current.choiceIndex === null;
  $('next').hidden = !!interruptStack.stack.length;
  $('next').disabled = current.choiceIndex === null && !current.waiting;
  $('next').textContent = current.waiting ? '出題条件を再確認' : '次の問題';
  $('sources').replaceChildren();
  for (const id of q.sourceArticleIds) {
    const article = data.articles.find(a => a.id === id);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = article.url; a.textContent = article.title;
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    li.append(a); $('sources').append(li);
  }
  if (focus) $('body').focus();
}

function validateData() {
  for (const collection of [data.questions, data.terms, data.articles]) {
    if (!Array.isArray(collection) || !collection.length || new Set(collection.map(x => x.id)).size !== collection.length)
      throw new Error('データのIDまたは件数が不正です。');
  }
  data.questions.forEach(q => questionById.set(q.id, q));
  data.terms.forEach(t => termById.set(t.id, t));
  const articleIds = new Set(data.articles.map(a => a.id));
  for (const q of data.questions) {
    if (!['term', 'relationship'].includes(q.type) || q.choices.length !== 3 ||
        !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 2 ||
        typeof q.revealAnswer !== 'boolean' || !q.termIds.every(id => termById.has(id)) ||
        !q.sourceArticleIds.every(id => articleIds.has(id)) ||
        [...q.body.matchAll(/\{\{term:([^}]+)\}\}/g)].some(m => !q.termIds.includes(m[1])))
      throw new Error(`問題データが不正です：${q.id}`);
  }
  for (const t of data.terms) {
    if (!t.questionIds.length || !t.questionIds.every(id => questionById.get(id)?.type === 'term') ||
        !(t.relatedTermIds ?? []).every(id => termById.has(id)) ||
        !t.referenceArticleIds.every(id => articleIds.has(id))) throw new Error(`用語データが不正です：${t.id}`);
  }
}

async function prepareOffline() {
  try {
    if (!('serviceWorker' in navigator)) throw new Error('HTTPSまたはlocalhostで起動してください。');
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    $('cache-status').textContent = 'オフライン準備完了。この端末でネット接続なしでも使えます。';
  } catch (error) {
    $('cache-status').textContent = `オフライン準備に失敗しました。オンラインで再読み込みしてください。${error.message}`;
  }
}

$('next').addEventListener('click', () => run(nextQuestion));
$('back').addEventListener('click', () => run(goBack));
run(async () => {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error('ダミーデータを読み込めません。');
  data = await response.json();
  validateData();
  db = await openDatabase();
  await nextQuestion();
  data.terms.forEach(t => $('terms').append(button(t.label, () => openTerm(t.id), 'term')));
  void prepareOffline();
});
