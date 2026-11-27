import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_FORMS, requestFieldKeys, widgetForm } from '../index.js';

const KINDS = new Set(['text', 'textarea', 'url', 'datetime', 'checkbox', 'image', 'choice', 'list', 'group']);

test('description publiable telle quelle : JSON pur, chaque champ avec clé, type connu et libellé', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(WIDGET_FORMS)), WIDGET_FORMS);
  const check = (fields, at) => {
    const keys = fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${at} : clés en double`);
    for (const field of fields) {
      assert.ok(KINDS.has(field.kind), `${at}.${field.key} : type ${field.kind}`);
      assert.ok(field.label, `${at}.${field.key} : libellé`);
      if (field.kind === 'choice') assert.ok(field.options.length > 0, `${at}.${field.key} : options`);
      if (field.kind === 'list') assert.ok(Boolean(field.item) !== Boolean(field.fields), `${at}.${field.key} : item ou fields`);
      if (field.fields) check(field.fields, `${at}.${field.key}`);
    }
  };
  for (const form of WIDGET_FORMS) {
    check(form.fields, form.type);
    assert.ok(form.fields.some((f) => f.key === form.titleField), `${form.type} : titleField`);
  }
});

test('champs acceptés par l\'API : ceux de la description, plus theme, brand et author', () => {
  assert.deepEqual(requestFieldKeys('poll').root.sort(), ['answers', 'author', 'brand', 'question', 'theme']);
  assert.deepEqual(requestFieldKeys('quiz').nested['questions.answers'], ['text', 'isCorrect']);
  assert.deepEqual(requestFieldKeys('calendar').nested.linkGlobal, ['text', 'href', 'newTab']);
  assert.equal(widgetForm('teaser'), null);
  assert.throws(() => requestFieldKeys('teaser'));
});
