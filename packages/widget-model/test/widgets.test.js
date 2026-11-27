import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCalendar, buildCalendarSaveData,
  validateTinder, buildTinderSaveData,
  validateQuiz, buildQuizSaveData,
  transformWidgetData,
} from '../index.js';

const TS = { sentinel: 'serverTimestamp' };
const serverTimestamp = () => TS;
const toTimestamp = (date) => ({ iso: date.toISOString() });
const fields = (errors) => errors.map(({ field, code }) => [field, code]);

// ---------- Calendrier ----------

const CAL = {
  theme: 'Sport',
  title: '  Coupe du monde  ',
  dates: [{ text: ' Finale ', complement: ' Lusail ', start: new Date('2026-12-18T15:00:00Z') }],
};

test('validateCalendar : ordre du dashboard, toutes les violations', () => {
  const errors = validateCalendar({
    theme: '', title: ' ',
    dates: [{ text: '', start: null }, { text: 'Ok', start: new Date('nope') }],
    linkGlobal: { text: 'Voir', href: '' },
    nbElemsToShow: 11,
    brand: 'pme',
  });
  assert.deepEqual(fields(errors), [
    ['theme', 'required'],
    ['title', 'required'],
    ['dates[0].text', 'required'],
    ['dates[0].start', 'required'],
    ['dates[1].start', 'invalid_value'],
    ['nbElemsToShow', 'invalid_value'],
    ['linkGlobal.href', 'required'],
    ['brand', 'invalid_value'],
  ]);
  assert.deepEqual(fields(validateCalendar({ ...CAL, dates: [] })), [['dates', 'too_few']]);
  assert.deepEqual(fields(validateCalendar({ ...CAL, linkGlobal: { text: 'x', href: 'javascript:alert(1)' } })), [['linkGlobal.href', 'invalid_value']]);
});

test('calendrier : document 4 blocs (titre, dates horodatées, tous les éléments par défaut)', () => {
  assert.deepEqual(validateCalendar(CAL), []);
  const doc = transformWidgetData({ ...buildCalendarSaveData(CAL, { toTimestamp }), id: 'c1', author: 'a@b.ch', deleted: false }, { serverTimestamp });
  assert.equal(doc.type, 'calendar');
  assert.equal(doc.meta.title, 'Coupe du monde');
  assert.equal(doc.meta.brand, 'blick');
  assert.deepEqual(doc.stats, { views: 0, seeAllClicks: 0 });
  assert.equal(doc.data.title, 'Coupe du monde');
  assert.equal(doc.data.nbElemsToShow, 100);
  assert.deepEqual(doc.data.dates, [{
    text: 'Finale', complement: 'Lusail', scheduleStart: { iso: '2026-12-18T15:00:00.000Z' },
    scheduleEnd: null, showBadge: false, liveLinkExists: false, liveLinkUrl: '',
  }]);
  assert.equal(doc.data.linkGlobalHref, '');
  assert.equal(doc.stats.globalLinkClicks, undefined);
});

test('calendrier : options avancées d\'un ancien calendrier conservées au réenregistrement', () => {
  const end = new Date('2026-12-18T17:00:00Z');
  const legacy = { ...CAL, dates: [{ ...CAL.dates[0], end, showBadge: true, liveLinkEnabled: true, liveLinkUrl: ' https://live ' }] };
  assert.deepEqual(validateCalendar(legacy), []);
  const [date] = buildCalendarSaveData(legacy, { toTimestamp }).dates;
  assert.deepEqual([date.scheduleEnd, date.showBadge, date.liveLinkExists, date.liveLinkUrl], [{ iso: end.toISOString() }, true, true, 'https://live']);
  const off = buildCalendarSaveData({ ...legacy, dates: [{ ...legacy.dates[0], liveLinkEnabled: false }] }, { toTimestamp }).dates[0];
  assert.deepEqual([off.liveLinkExists, off.liveLinkUrl], [false, '']);
  assert.deepEqual(fields(validateCalendar({ ...CAL, dates: [{ ...CAL.dates[0], end: new Date('nope'), showBadge: 'oui' }] })), [
    ['dates[0].end', 'invalid_value'],
    ['dates[0].showBadge', 'invalid_type'],
  ]);
});

// ---------- Tinder ----------

const TIN = { theme: 'Suisse', label: ' Débat ', title: ' Pour ou contre ? ', cards: [{ label: 'A', title: 'Première' }, { label: 'B', title: 'Deuxième' }, { label: 'C', title: 'Troisième' }] };

test('validateTinder : exactement 3 cartes (comme le formulaire), label et titre par carte', () => {
  assert.deepEqual(validateTinder(TIN), []);
  for (const count of [0, 1, 2]) {
    const errors = validateTinder({ ...TIN, cards: TIN.cards.slice(0, count) });
    assert.deepEqual(fields(errors), [['cards', 'too_few']], `${count} carte(s)`);
    assert.equal(errors[0].message, 'Le tinder doit avoir exactement 3 cartes.');
  }
  assert.deepEqual(fields(validateTinder({ ...TIN, cards: [1, 2, 3, 4].map(() => ({ label: 'x', title: 'y' })) })), [['cards', 'too_many']]);
  assert.deepEqual(fields(validateTinder({ ...TIN, label: '', cards: [{ label: '', title: 'ok' }, { label: 'ok' }, TIN.cards[2]], legend: { display: true, txt: ' ' } })), [
    ['label', 'required'],
    ['cards[0].label', 'required'],
    ['cards[1].title', 'required'],
    ['legend', 'required'],
  ]);
});

test('tinder : id par carte, votes à zéro par id, légende masquée', () => {
  const doc = transformWidgetData({ ...buildTinderSaveData(TIN), id: 't1', deleted: false }, { serverTimestamp });
  const ids = doc.data.tinderCards.map((card) => card.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(doc.data.tinderCards.map(({ tinderCardLabel, tinderCardTitle }) => [tinderCardLabel, tinderCardTitle]), [['A', 'Première'], ['B', 'Deuxième'], ['C', 'Troisième']]);
  assert.deepEqual(doc.stats.tinderVotes, Object.fromEntries(ids.map((id) => [id, { yes: 0, no: 0 }])));
  assert.deepEqual(doc.data.tinderLegend, { txt: '', display: false });
  assert.equal(doc.meta.title, 'Pour ou contre ?');
  assert.equal(doc.data.tinderLabel, 'Débat');
});

test('tinder : les votes existants suivent l\'id de la carte (édition dashboard)', () => {
  const save = buildTinderSaveData({ ...TIN, cards: [{ id: 'k2', label: 'B', title: 'x' }, { id: 'k1', label: 'A', title: 'y' }], tinderVotes: { k1: { yes: 4, no: 1 }, gone: { yes: 9, no: 9 } } });
  assert.deepEqual(save.tinderVotes, { k2: { yes: 0, no: 0 }, k1: { yes: 4, no: 1 } });
});

// ---------- Quiz ----------

const answers = (correct = 1) => ['3', '4', '5', '22'].map((text, i) => ({ text, isCorrect: i === correct }));
const QUIZ = {
  theme: 'Inter',
  title: ' Quiz maths ',
  questions: [{ text: ' 2+2 ? ', answers: answers(), hint: ' facile ' }, { text: '3+3 ?', answers: answers(0), img: 'https://cdn/x.webp' }],
  conclusion: { text1: 'Raté', text2: 'Pas mal', text3: 'Bravo' },
};

test('validateQuiz : 4 réponses, exactement une bonne, conclusions obligatoires', () => {
  assert.deepEqual(validateQuiz(QUIZ), []);
  const bad = validateQuiz({
    theme: 'Inter',
    title: 'T',
    questions: [
      { text: '', answers: answers() },
      { text: 'Q', answers: answers().slice(0, 3) },
      { text: 'Q', answers: [{ text: '' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] },
      { text: 'Q', answers: answers().map((a) => ({ ...a, isCorrect: true })) },
    ],
    conclusion: { text1: 'a', text2: ' ' },
  });
  assert.deepEqual(fields(bad), [
    ['questions[0].text', 'required'],
    ['questions[1].answers', 'invalid_value'],
    ['questions[2].answers[0].text', 'required'],
    ['questions[2].correctAnswer', 'invalid_value'],
    ['questions[3].correctAnswer', 'invalid_value'],
    ['conclusion.text2', 'required'],
    ['conclusion.text3', 'required'],
  ]);
  assert.deepEqual(fields(validateQuiz({ ...QUIZ, questions: [] })), [['questions', 'too_few']]);
  assert.deepEqual(fields(validateQuiz({ ...QUIZ, brand: 'pme' })), [['brand', 'invalid_value']]);
  const withImage = (img) => fields(validateQuiz({ ...QUIZ, questions: [{ ...QUIZ.questions[0], img }] }));
  assert.deepEqual(withImage(''), []);
  assert.deepEqual(withImage('https://firebasestorage.googleapis.com/v0/b/x/o/quizs%2Fa.webp?alt=media&token=t'), []);
  for (const bad of ['http://cdn/x.jpg', 'pas une url', 42]) assert.deepEqual(withImage(bad), [['questions[0].img', 'invalid_value']], String(bad));
});

test('quiz : id par question, compteurs par id, distribution 0..n', () => {
  const doc = transformWidgetData({ ...buildQuizSaveData(QUIZ), id: 'q1', deleted: false }, { serverTimestamp });
  const ids = doc.data.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(doc.data.questions[0], {
    id: ids[0], text: '2+2 ?', hint: 'facile', img: '', hidePercent: false,
    answers: [
      { isCorrect: false, text: '3' }, { isCorrect: true, text: '4' },
      { isCorrect: false, text: '5' }, { isCorrect: false, text: '22' },
    ],
  });
  assert.equal(doc.data.questions[1].img, 'https://cdn/x.webp');
  assert.deepEqual(doc.stats.statsQuestions, { [ids[0]]: { correct: 0, incorrect: 0 }, [ids[1]]: { correct: 0, incorrect: 0 } });
  assert.deepEqual(doc.stats.statsGlobal, { scoreDistribution: { 0: 0, 1: 0, 2: 0 } });
  assert.deepEqual(doc.data.conclusion, { text1: 'Raté', text2: 'Pas mal', text3: 'Bravo' });
  assert.equal(doc.meta.title, 'Quiz maths');
});

test('quiz : un id existant est conservé', () => {
  const save = buildQuizSaveData({ ...QUIZ, questions: [{ ...QUIZ.questions[0], id: 'keep' }] });
  assert.equal(save.questions[0].id, 'keep');
  assert.deepEqual(Object.keys(save.statsQuestions), ['keep']);
});
