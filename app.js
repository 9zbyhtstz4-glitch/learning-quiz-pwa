import { config } from './config.js';
import { refresh, recordPresentation, recordAnswer, selectNext, shuffledIndices } from './progress.js';
import { openDatabase, updateProgress, readSetting, writeSetting } from './db.js';
import { fieldOptions } from './fields.js';

const $ = id => document.getElementById(id);
let data, db, current = null, busy = false;
// schemaのstackはIDのみ。画面状態は別の配列で同じ深さに保存する。
const interruptStack = { stack: [], maxDepth: config.maxDepth };
const suspendedViews = [];
const questionById = new Map();
const termById = new Map();
// 選択中の分野(nullはすべての分野)。絞り込むのは次の問題の自動選択だけで、用語タップの遷移には使わない。
let selectedField = null;
let allowed = null;
const fieldById = new Map();

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
  const { id, elsewhere } = await updateProgress(db, data.questions, records => {
    const now = Date.now();
    refresh(records, now, config);
    const id = selectNext(records, allowed);
    if (id) recordPresentation(records, id, now, config);
    // 絞り込み中に出題できないときだけ、他の分野にはまだ出題できる問題があるかを見る。
    return { id, elsewhere: !id && allowed !== null && selectNext(records) !== null };
  });
  if (id) current = makeView(id);
  else if (current) Object.assign(current, { waiting: true, elsewhere });
  else {
    // セッション復元ではない。出題できる問題がないまま再起動した時の閲覧専用の問題文。
    const first = data.questions.find(q => !allowed || allowed.has(q.id));
    current = { ...makeView(first.id), waiting: true, readOnly: true, elsewhere };
  }
  render();
}

function allowedFor(fieldId) {
  return fieldId === null ? null : new Set(data.questions.filter(q => q.fieldId === fieldId).map(q => q.id));
}

function renderFields() {
  const label = selectedField === null ? 'すべて' : fieldById.get(selectedField).label;
  $('field-open').textContent = `分野：${label}`;
  $('field-open').setAttribute('aria-label', `出題する分野を選ぶ。現在は${label}`);
  const options = [{ id: null, label: 'すべての分野', count: data.questions.length }, ...fieldById.values()];
  $('fields').replaceChildren(...options.map(({ id, label, count }) => {
    const el = button('', () => selectField(id));
    el.setAttribute('aria-pressed', String(selectedField === id));
    const name = document.createElement('span');
    name.textContent = label;
    const size = document.createElement('span');
    size.className = 'field-count';
    size.textContent = `${count}問`;
    el.replaceChildren(name, size);
    return el;
  }));
}

async function selectField(fieldId) {
  selectedField = fieldId;
  allowed = allowedFor(fieldId);
  await writeSetting(db, 'field', fieldId);
  renderFields();
  $('field-sheet').close();
  // 待機中なら「出題条件を再確認」と同じく、選び直した分野で次の問題を探す。回答中の問題はそのまま残す。
  if (current?.waiting && !interruptStack.stack.length) await nextQuestion();
}

function waitingText() {
  if (selectedField === null) return '待機中・用語は確認できます';
  const hint = current.elsewhere ? '分野を変えると続けられます・' : '';
  return `「${fieldById.get(selectedField).label}」の分野は待機中・${hint}用語は確認できます`;
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
  if (current.waiting) $('waiting').textContent = waitingText();
  $('definition').hidden = true;
  $('meta').textContent = `${q.type === 'term' ? '用語問題' : '関係性問題'} · 中断 ${interruptStack.stack.length} / ${interruptStack.maxDepth}`;
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
  $('back').textContent = '←';
  $('back').setAttribute('aria-label', '元の問題に戻る');
  $('next').hidden = !!interruptStack.stack.length;
  $('next').disabled = current.choiceIndex === null && !current.waiting;
  $('next').textContent = current.waiting ? '↻' : '→';
  $('next').setAttribute('aria-label', current.waiting ? '出題条件を再確認' : '次の問題');
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
    $('cache-status').hidden = true;
  } catch (error) {
    $('cache-status').textContent = 'オフライン準備に失敗しました。再読み込みしてください。';
    $('cache-status').hidden = false;
  }
}

$('next').addEventListener('click', () => run(nextQuestion));
$('back').addEventListener('click', () => run(goBack));
let sheetScrollY = 0;
function closeSheet(sheet) {
  document.body.classList.remove('sheet-open');
  document.body.style.removeProperty('top');
  window.scrollTo(0, sheetScrollY);
}
document.querySelectorAll('[data-sheet]').forEach(button => {
  button.addEventListener('click', () => {
    sheetScrollY = window.scrollY;
    document.body.style.top = `-${sheetScrollY}px`;
    document.body.classList.add('sheet-open');
    $(button.dataset.sheet).showModal();
  });
});
document.querySelectorAll('.sheet').forEach(sheet => {
  sheet.querySelector('[data-close-sheet]').addEventListener('click', () => sheet.close());
  sheet.addEventListener('close', () => closeSheet(sheet));
});
run(async () => {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error('ダミーデータを読み込めません。');
  data = await response.json();
  validateData();
  $('library-count').textContent = `収録 ${data.questions.length}問 · 用語 ${data.terms.length}件`;
  db = await openDatabase();
  fieldOptions(data.questions).forEach(f => fieldById.set(f.id, f));
  const saved = await readSetting(db, 'field');
  // 保存していた分野がデータから消えていたら、すべての分野に戻す。
  selectedField = fieldById.has(saved) ? saved : null;
  if (saved != null && selectedField === null) await writeSetting(db, 'field', null);
  allowed = allowedFor(selectedField);
  renderFields();
  await nextQuestion();
  data.terms.forEach(t => $('terms').append(button(t.label, async () => {
    $('terms-sheet').close();
    await openTerm(t.id);
  }, 'term')));
  void prepareOffline();
});
