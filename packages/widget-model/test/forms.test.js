import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WIDGET_FORMS, requestFieldKeys, widgetForm, listTeamsForPicker,
  validateTeaser, validateFolder, validateNatinotes, validatePotm, validateFacts,
} from '../index.js';
import { SAMPLES, TEAMS, clone } from './fixtures.js';

const KINDS = new Set(['text', 'textarea', 'url', 'datetime', 'date', 'number', 'checkbox', 'image', 'richtext', 'choice', 'list', 'group']);

test('description publiable telle quelle : JSON pur, chaque champ avec clé, type connu et libellé', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(WIDGET_FORMS)), WIDGET_FORMS);
  const check = (fields, at) => {
    const keys = fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${at} : clés en double`);
    for (const field of fields) {
      const where = `${at}.${field.key}`;
      assert.ok(KINDS.has(field.kind), `${where} : type ${field.kind}`);
      assert.ok(field.label, `${where} : libellé`);
      if (field.kind === 'choice') {
        const sources = [Boolean(field.options), field.source === 'teams', Boolean(field.dependsOn)].filter(Boolean);
        assert.equal(sources.length, 1, `${where} : options, source ou dependsOn`);
        if (field.options) assert.ok(field.options.length > 0, `${where} : options`);
        if (field.dependsOn) {
          const parent = WIDGET_FORMS.flatMap((form) => form.fields).find((f) => f.key === field.dependsOn && f.options);
          assert.ok(parent, `${where} : dependsOn vise un choix racine`);
          assert.deepEqual(Object.keys(field.optionsBy).sort(), parent.options.map((o) => o.value).sort(), `${where} : optionsBy par valeur`);
          for (const options of Object.values(field.optionsBy)) assert.ok(options.length > 0, `${where} : optionsBy non vide`);
        }
        if (field.default !== undefined) assert.ok(field.options.some((o) => o.value === field.default), `${where} : défaut parmi les options`);
      }
      if (field.kind === 'list') assert.ok(Boolean(field.item) !== Boolean(field.fields), `${where} : item ou fields`);
      if (field.variants) {
        assert.ok(field.variants.key && field.variants.label, `${where} : clé et libellé des variantes`);
        for (const option of field.variants.options) {
          assert.ok(option.value && option.label && Array.isArray(option.fields), `${where}.${option.value}`);
          check([...field.fields, ...option.fields], `${where}.${option.value}`);
          for (const [key, value] of Object.entries(option.defaults ?? {})) {
            const target = option.fields.find((f) => f.key === key);
            assert.ok(target, `${where}.${option.value} : défaut ${key} sans champ`);
            if (target.options) assert.ok(target.options.some((o) => o.value === value), `${where}.${option.value} : défaut ${key} admis`);
          }
        }
      }
      if (field.fields) check(field.fields, where);
    }
  };
  for (const form of WIDGET_FORMS) {
    check(form.fields, form.type);
    assert.ok(form.fields.some((f) => f.key === form.titleField), `${form.type} : titleField`);
    assert.equal(form.fields.filter((f) => f.key !== 'brand').at(-1).key, 'theme', `${form.type} : rubrique en dernier (avant la marque)`);
    const hasImage = JSON.stringify(form.fields).includes('"kind":"image"');
    assert.equal(Boolean(form.images?.prefix), hasImage, `${form.type} : préfixe d'images`);
  }
});

test('formats publiés, dans l\'ordre ; testimony et prono restent réservés au dashboard', () => {
  assert.deepEqual(WIDGET_FORMS.map((f) => f.type), ['poll', 'calendar', 'tinder', 'quiz', 'teaser', 'folder', 'natinotes', 'potm', 'facts']);
  assert.deepEqual(WIDGET_FORMS.map((f) => f.resource), ['polls', 'calendars', 'tinders', 'quizzes', 'teasers', 'folders', 'natinotes', 'potms', 'facts']);
  assert.deepEqual(Object.fromEntries(WIDGET_FORMS.filter((f) => f.images).map((f) => [f.type, f.images.prefix])), { quiz: 'quizs', teaser: 'teasers', folder: 'folders', facts: 'factss' });
  for (const type of ['testimony', 'prono']) {
    assert.equal(widgetForm(type), null);
    assert.throws(() => requestFieldKeys(type));
  }
});

test('champs acceptés par l\'API : ceux de la description, plus theme, brand et author ; variantes réunies', () => {
  assert.deepEqual(requestFieldKeys('poll').root.sort(), ['answers', 'author', 'brand', 'question', 'theme']);
  assert.deepEqual(requestFieldKeys('quiz').nested['questions.answers'], ['text', 'isCorrect']);
  assert.deepEqual(requestFieldKeys('calendar').nested.linkGlobal, ['text', 'href', 'newTab']);
  assert.deepEqual(requestFieldKeys('teaser'), {
    root: ['label', 'title', 'img', 'button', 'theme', 'brand', 'author'],
    nested: { button: ['text', 'href', 'newTab'] },
  });
  assert.deepEqual(requestFieldKeys('natinotes').nested, { players: ['id', 'blickRating', 'comment'] });
  assert.deepEqual(requestFieldKeys('potm').root, ['context', 'category', 'text', 'date', 'players', 'theme', 'brand', 'author']);
  assert.deepEqual(requestFieldKeys('facts').nested, { items: ['type', 'icon', 'title', 'text', 'author', 'picture', 'src', 'caption', 'value'] });
});

// ---------- Description et règles disent la même chose (formats de la spec 005) ----------

const VALIDATORS = {
  teaser: (input) => validateTeaser(input),
  folder: (input) => validateFolder(input),
  natinotes: (input) => validateNatinotes(input, { teams: TEAMS }),
  potm: (input) => validatePotm(input),
  facts: (input) => validateFacts(input),
};

const PICKER_IDS = listTeamsForPicker(TEAMS).flatMap((team) => team.players.map((p) => p.id));

/** Copie de `input` où `path` (clés et indices) reçoit `value` ; `undefined` retire la clé. */
function withValue(input, path, value) {
  const copy = clone(input);
  const parent = path.slice(0, -1).reduce((node, key) => node[key], copy);
  const last = path.at(-1);
  if (value === undefined) delete parent[last];
  else parent[last] = value;
  return copy;
}

const fieldPath = (path) => path.reduce((at, key) => (typeof key === 'number' ? `${at}[${key}]` : at ? `${at}.${key}` : key), '');
const errorsAt = (errors, path) => errors.filter((e) => e.field === path).map((e) => e.code);
const errorsUnder = (errors, path) => errors.filter((e) => e.field === path || e.field.startsWith(`${path}.`) || e.field.startsWith(`${path}[`));

/** Vérifie un champ de la description contre le validateur, à partir d'une entrée valide. */
function checkField(type, input, field, path) {
  const validate = VALIDATORS[type];
  const at = fieldPath(path);
  const where = `${type} ${at}`;
  const without = validate(withValue(input, path, undefined));
  const set = (value) => validate(withValue(input, path, value));

  // Une liste est obligatoire dès qu'elle a un minimum
  const required = field.kind === 'list' ? field.min > 0 : field.required && field.kind !== 'checkbox';
  if (required) {
    assert.ok(errorsUnder(without, at).length > 0, `${where} : obligatoire`);
    if (field.kind !== 'group') assert.deepEqual(errorsAt(without, at), ['required'], `${where} : absent → required`);
  } else {
    assert.deepEqual(without, [], `${where} : facultatif`);
  }

  switch (field.kind) {
    case 'text':
    case 'textarea':
      assert.deepEqual(errorsAt(set('   '), at), ['required'], `${where} : blanc`);
      break;
    case 'richtext':
      assert.deepEqual(errorsAt(set('<p><br></p>'), at), ['required'], `${where} : vide après nettoyage`);
      assert.deepEqual(errorsAt(set('<p>Texte <b>gras</b> et <a href="https://blick.ch">lien</a></p>'), at), [], `${where} : HTML admis`);
      break;
    case 'url':
      assert.deepEqual(errorsAt(set('javascript:alert(1)'), at), ['invalid_value'], `${where} : non http(s)`);
      break;
    case 'image':
      assert.deepEqual(errorsAt(set('http://cdn.example/x.jpg'), at), ['invalid_value'], `${where} : non https`);
      break;
    case 'date':
      assert.deepEqual(errorsAt(set(new Date('pas une date')), at), ['invalid_value'], `${where} : date invalide`);
      assert.deepEqual(errorsAt(set(new Date('2027-01-31T11:00:00Z')), at), [], `${where} : date admise`);
      break;
    case 'number':
      assert.deepEqual(errorsAt(set(1.5), at), ['invalid_value'], `${where} : entier`);
      assert.deepEqual(errorsAt(set(-3), at), field.min > -3 ? ['invalid_value'] : [], `${where} : min`);
      break;
    case 'checkbox':
      assert.deepEqual(errorsAt(set('oui'), at), ['invalid_type'], `${where} : booléen`);
      assert.deepEqual(errorsAt(set(!field.default), at), [], `${where} : booléen admis`);
      break;
    case 'choice':
      assert.deepEqual(errorsAt(set('valeur-inconnue'), at), ['invalid_value'], `${where} : valeur hors liste`);
      if (field.options) {
        for (const { value } of field.options) assert.deepEqual(errorsAt(set(value), at), [], `${where} : ${value} admis`);
      } else if (field.source === 'teams') {
        for (const id of PICKER_IDS) assert.deepEqual(errorsAt(set(id), at), [], `${where} : joueur ${id} admis`);
      } else if (field.dependsOn) {
        for (const [parentValue, options] of Object.entries(field.optionsBy)) {
          const others = Object.entries(field.optionsBy).filter(([key]) => key !== parentValue).flatMap(([, list]) => list.map((o) => o.value));
          const outside = others.find((value) => !options.some((o) => o.value === value));
          const base = withValue(input, [field.dependsOn], parentValue);
          for (const { value } of options) {
            assert.deepEqual(errorsAt(validate(withValue(base, path, value)), at), [], `${where} : ${value} admis pour ${parentValue}`);
          }
          assert.deepEqual(errorsAt(validate(withValue(base, path, outside)), at), ['invalid_value'], `${where} : ${outside} refusé pour ${parentValue}`);
        }
      }
      break;
    case 'group':
      for (const child of field.fields) checkField(type, input, child, [...path, child.key]);
      break;
    case 'list':
      checkList(type, input, field, path);
      break;
  }
}

function checkList(type, input, field, path) {
  const validate = VALIDATORS[type];
  const at = fieldPath(path);
  const items = path.reduce((node, key) => node[key], input);
  const resize = (count) => Array.from({ length: count }, (_, i) => clone(items[i % items.length]));
  if (field.min > 0) {
    assert.deepEqual(errorsAt(validate(withValue(input, path, resize(field.min - 1))), at), ['too_few'], `${type} ${at} : min ${field.min}`);
  }
  if (field.max !== null) {
    assert.deepEqual(errorsAt(validate(withValue(input, path, resize(field.max))), at), [], `${type} ${at} : max ${field.max} admis`);
    assert.deepEqual(errorsAt(validate(withValue(input, path, resize(field.max + 1))), at), ['too_many'], `${type} ${at} : max ${field.max}`);
  }
  if (!field.variants) {
    for (const child of field.fields) checkField(type, input, child, [...path, 0, child.key]);
    return;
  }
  const { key, options } = field.variants;
  const allKeys = [...new Set(options.flatMap((o) => o.fields.map((f) => f.key)))];
  for (const option of options) {
    const index = items.findIndex((item) => item[key] === option.value);
    assert.ok(index >= 0, `${type} ${at} : exemple de ${option.value}`);
    for (const child of [...field.fields, ...option.fields]) checkField(type, input, child, [...path, index, child.key]);
    // Champ d'une autre variante renseigné → unknown_field
    const foreign = allKeys.find((k) => !option.fields.some((f) => f.key === k));
    if (foreign) {
      const donor = items.find((item) => item[foreign] !== undefined);
      const errors = validate(withValue(input, [...path, index, foreign], donor[foreign]));
      assert.deepEqual(errorsAt(errors, `${at}[${index}].${foreign}`), ['unknown_field'], `${type} ${at} : ${foreign} hors ${option.value}`);
    }
    if (option.max !== undefined) {
      const extra = [...items, ...Array.from({ length: option.max }, () => clone(items[index]))];
      const errors = validate(withValue(input, path, extra));
      assert.deepEqual(errors.map((e) => [e.field, e.code]), [[`${at}[${items.length + option.max - 1}].${key}`, 'too_many']], `${type} ${at} : max ${option.max} ${option.value}`);
    }
  }
  assert.deepEqual(errorsAt(validate(withValue(input, [...path, 0, key], 'inconnu')), `${at}[0].${key}`), ['invalid_value'], `${type} ${at} : ${key} inconnu`);
}

for (const type of Object.keys(VALIDATORS)) {
  test(`${type} : la description et validate${type[0].toUpperCase()}${type.slice(1)} concordent (obligations, valeurs, bornes)`, () => {
    const form = widgetForm(type);
    assert.deepEqual(VALIDATORS[type](SAMPLES[type]), [], 'exemple valide');
    for (const field of form.fields) checkField(type, SAMPLES[type], field, [field.key]);
    // Toute clé de l'exemple est connue de la description
    const { root, nested } = requestFieldKeys(type);
    for (const key of Object.keys(SAMPLES[type])) assert.ok(root.includes(key), `${type} : ${key}`);
    for (const [path, keys] of Object.entries(nested)) {
      const value = SAMPLES[type][path];
      for (const item of Array.isArray(value) ? value : [value]) {
        for (const key of Object.keys(item)) assert.ok(keys.includes(key), `${type} ${path} : ${key}`);
      }
    }
  });
}
