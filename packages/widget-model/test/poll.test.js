import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePoll, buildPollSaveData, transformWidgetData, buildEmbedUrl } from '../index.js';

const TS = { sentinel: 'serverTimestamp' };
const serverTimestamp = () => TS;
const answers = (...texts) => texts.map((text, i) => ({ id: `a${i + 1}`, text }));

test('validatePoll accepte un sondage complet, marque absente, 14 réponses', () => {
  const many = answers(...Array.from({ length: 14 }, (_, i) => `R${i}`));
  assert.deepEqual(validatePoll({ theme: 'Sport', question: 'Q ?', answers: many }), []);
});

test('validatePoll renvoie toutes les violations dans l\'ordre du dashboard', () => {
  const errors = validatePoll({ theme: 'sport', question: '   ', answers: answers(' '), brand: 'letemps' });
  assert.deepEqual(
    errors.map(({ field, code }) => [field, code]),
    [
      ['theme', 'invalid_value'],
      ['question', 'required'],
      ['answers', 'too_few'],
      ['answers[0]', 'required'],
      ['brand', 'invalid_value'],
    ],
  );
});

test('validatePoll distingue absence et mauvais type', () => {
  const errors = validatePoll({ question: 42, answers: 'Oui, Non' });
  assert.deepEqual(
    errors.map(({ field, code }) => [field, code]),
    [['theme', 'required'], ['question', 'invalid_type'], ['answers', 'invalid_type']],
  );
  const typed = validatePoll({ theme: 'Inter', question: 'Q', answers: [{ id: 'x', text: 1 }, { id: 'y', text: 'Non' }] });
  assert.deepEqual(typed.map(({ field, code }) => [field, code]), [['answers[0]', 'invalid_type']]);
});

test('le document poll garde les compteurs par id et rogne les textes', () => {
  const saveData = buildPollSaveData({
    question: '  Semaine de 4 jours ?  ',
    answers: [{ id: 'b', text: ' Non ' }, { id: 'a', text: 'Oui' }],
    answerCounters: { a: 7, gone: 3 },
    theme: 'Suisse',
  });
  const doc = transformWidgetData({ ...saveData, id: 'doc1', author: 'jane@ringier.ch', deleted: false }, { serverTimestamp });

  assert.deepEqual(doc, {
    type: 'poll',
    meta: {
      id: 'doc1',
      brand: 'blick',
      theme: 'Suisse',
      author: 'jane@ringier.ch',
      deleted: false,
      timeCreated: TS,
      timeUpdated: TS,
      title: 'Semaine de 4 jours ?',
    },
    stats: { views: 0, answerCounters: { b: 0, a: 7 } },
    data: {
      question: 'Semaine de 4 jours ?',
      answerTxts: [{ id: 'b', text: 'Non' }, { id: 'a', text: 'Oui' }],
    },
  });
});

test('buildEmbedUrl : marque pour poll uniquement, défaut blick', () => {
  const base = 'https://example.test/bl-tools-client-';
  assert.equal(buildEmbedUrl({ type: 'poll', id: 'x1', brand: 'pme' }, base), `${base}poll/?pollDoc=x1&brand=pme`);
  assert.equal(buildEmbedUrl({ type: 'poll', id: 'x1', brand: '' }, base), `${base}poll/?pollDoc=x1&brand=blick`);
  assert.equal(buildEmbedUrl({ type: 'quiz', id: 'q9', brand: 'pme' }, base), `${base}quiz/?quizDoc=q9`);
});
