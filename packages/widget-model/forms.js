// Description des formulaires de création des formats ouverts à l'API (spec 004) : champs de la
// requête, type de saisie, libellé et exemple en français, obligation, bornes. Publiée par l'API
// (`GET /widget-types`) : le Hub Rédaction construit ses formulaires à partir d'elle, sans recopier
// les règles. Les règles elles-mêmes restent dans les `validate*` de ce package ; les bornes
// d'ici réutilisent leurs constantes, et les tests de l'API vérifient que les deux disent la même
// chose (apps/api/test/forms.test.js). Le dashboard garde ses propres formulaires.
//
// Types de champ (`kind`) :
//   text, textarea  texte ; url : adresse http(s) ; datetime : date et heure suisses, sans décalage
//                   (« 2026-12-20T20:45 ») ; checkbox : booléen ; image : adresse https d'une image
//                   (le Hub l'envoie d'abord par `POST /images`) ;
//   choice          une valeur parmi `options` ; `emptyLabel` : choix « vide » (champ absent) ;
//   list            liste d'éléments (`fields`), ou de textes si `item` est donné ; `min` / `max`
//                   (null = sans maximum) ; `correct` : clé booléenne vraie sur un seul élément
//                   (erreur sur `<liste parente>.correctAnswer`) ;
//   group           objet (`fields`) ; `optional` : absent si tous ses textes sont vides.
// `required` : obligatoire. `default` : valeur proposée au départ. Champs communs non saisis ici :
// `author` (fixé par le Hub) et `brand` (proposée seulement quand il y a un choix).

import { WIDGET_THEMES, BLICK_ONLY_BRANDS } from './common.js';
import { POLL_BRANDS } from './poll.js';
import { CALENDAR_MAX_ELEMENTS_CHOICE } from './calendar.js';
import { TINDER_CARDS } from './tinder.js';
import { QUIZ_ANSWERS_PER_QUESTION, QUIZ_CONCLUSION_KEYS, QUIZ_CONCLUSION_RANGES } from './quiz.js';

const BRAND_LABELS = { blick: 'Blick', pme: 'PME' };

const theme = Object.freeze({
  key: 'theme',
  kind: 'choice',
  label: 'Rubrique',
  required: true,
  options: WIDGET_THEMES.map((value) => ({ value, label: value })),
});

/** Champs communs acceptés par toutes les créations, en plus de ceux de la description. */
export const WIDGET_COMMON_REQUEST_FIELDS = Object.freeze(['theme', 'brand', 'author']);

/** Formats ouverts à l'API, dans l'ordre d'affichage du Hub. */
export const WIDGET_FORMS = deepFreeze([
  {
    type: 'poll',
    resource: 'polls',
    name: 'Sondage',
    noun: 'sondage',
    titleField: 'question',
    brands: [...POLL_BRANDS],
    fields: [
      { key: 'question', kind: 'textarea', label: 'Question', placeholder: 'Faut-il introduire la semaine de 4 jours en Suisse ?', required: true },
      {
        key: 'answers',
        kind: 'list',
        label: 'Réponses',
        itemLabel: 'Réponse',
        addLabel: 'Ajouter une réponse',
        min: 2,
        max: null,
        item: { kind: 'text', required: true },
      },
      theme,
      {
        key: 'brand',
        kind: 'choice',
        label: 'Marque',
        required: false,
        default: 'blick',
        options: POLL_BRANDS.map((value) => ({ value, label: BRAND_LABELS[value] ?? value })),
      },
    ],
  },
  {
    type: 'calendar',
    resource: 'calendars',
    name: 'Calendrier',
    noun: 'calendrier',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      { key: 'title', kind: 'text', label: 'Titre', placeholder: 'Ne ratez aucun match de la Nati', required: true },
      {
        key: 'dates',
        kind: 'list',
        label: 'Dates',
        itemLabel: 'Date',
        addLabel: 'Ajouter une date',
        min: 1,
        max: null,
        fields: [
          { key: 'text', kind: 'text', label: 'Texte', placeholder: 'Suisse – France', required: true },
          { key: 'start', kind: 'datetime', label: 'Date et heure (heure suisse)', required: true },
          { key: 'complement', kind: 'text', label: 'Complément', placeholder: 'Stade de Genève, Genève', required: false },
        ],
      },
      {
        key: 'nbElemsToShow',
        kind: 'choice',
        label: 'Dates affichées',
        required: false,
        emptyLabel: 'Toutes',
        options: Array.from({ length: CALENDAR_MAX_ELEMENTS_CHOICE }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
      },
      {
        key: 'linkGlobal',
        kind: 'group',
        label: 'Lien sous le calendrier',
        required: false,
        optional: true,
        fields: [
          { key: 'text', kind: 'text', label: 'Texte du lien', placeholder: 'Vers la billetterie', required: true },
          { key: 'href', kind: 'url', label: 'Adresse', placeholder: 'https://…', required: true },
          { key: 'newTab', kind: 'checkbox', label: 'Ouvrir dans un nouvel onglet', required: false, default: false },
        ],
      },
      theme,
    ],
  },
  {
    type: 'tinder',
    resource: 'tinders',
    name: 'Tinder',
    noun: 'tinder',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      { key: 'label', kind: 'text', label: 'Étiquette', placeholder: 'Ton avis', required: true },
      { key: 'title', kind: 'textarea', label: 'Titre', placeholder: 'Ces mesures te convainquent-elles ?', required: true },
      {
        key: 'cards',
        kind: 'list',
        label: 'Cartes',
        itemLabel: 'Carte',
        min: TINDER_CARDS,
        max: TINDER_CARDS,
        fields: [
          { key: 'label', kind: 'text', label: 'Étiquette', placeholder: 'Mesure', required: true },
          { key: 'title', kind: 'text', label: 'Titre', placeholder: 'Semaine de 4 jours', required: true },
        ],
      },
      { key: 'legend', kind: 'text', label: 'Légende sous les cartes', placeholder: 'Glisse à droite pour « pour », à gauche pour « contre ».', required: false },
      theme,
    ],
  },
  {
    type: 'quiz',
    resource: 'quizzes',
    name: 'Quiz',
    noun: 'quiz',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      { key: 'title', kind: 'text', label: 'Titre', placeholder: 'Connais-tu la Suisse ?', required: true },
      {
        key: 'questions',
        kind: 'list',
        label: 'Questions',
        itemLabel: 'Question',
        addLabel: 'Ajouter une question',
        min: 1,
        max: null,
        fields: [
          { key: 'text', kind: 'textarea', label: 'Question', placeholder: 'Quelle est la capitale fédérale ?', required: true },
          {
            key: 'answers',
            kind: 'list',
            label: 'Réponses (coche la bonne)',
            itemLabel: 'Réponse',
            min: QUIZ_ANSWERS_PER_QUESTION,
            max: QUIZ_ANSWERS_PER_QUESTION,
            correct: 'isCorrect',
            fields: [{ key: 'text', kind: 'text', label: 'Réponse', required: true }],
          },
          { key: 'hint', kind: 'text', label: 'Explication après la réponse', placeholder: 'Effectivement, depuis 1848…', required: false },
          { key: 'img', kind: 'image', label: 'Image', required: false },
          { key: 'hidePercent', kind: 'checkbox', label: 'Masquer les pourcentages après la réponse', required: false, default: false },
        ],
      },
      {
        key: 'conclusion',
        kind: 'group',
        label: 'Conclusion selon le score',
        required: true,
        fields: QUIZ_CONCLUSION_KEYS.map((key) => ({
          key,
          kind: 'text',
          label: `Score de ${QUIZ_CONCLUSION_RANGES[key]}`,
          placeholder: { text1: 'Peut mieux faire !', text2: 'Pas mal !', text3: 'Expert !' }[key],
          required: true,
        })),
      },
      theme,
    ],
  },
]);

/** Description d'un format par son type (`poll`, `calendar`…), sinon null. */
export const widgetForm = (type) => WIDGET_FORMS.find((form) => form.type === type) ?? null;

/**
 * Clés acceptées dans une requête de création : à la racine (description + champs communs) et
 * dans chaque objet imbriqué, par chemin sans indice (`dates`, `questions`, `questions.answers`,
 * `linkGlobal`…). Sert à l'API pour refuser les champs inconnus (`unknown_field`).
 * @returns {{ root: string[], nested: Record<string, string[]> }}
 */
export function requestFieldKeys(type) {
  const form = widgetForm(type);
  if (!form) throw new Error(`Format sans description : ${type}`);
  const nested = {};
  const walk = (fields, path) => {
    for (const field of fields) {
      if (!field.fields) continue;
      const at = path ? `${path}.${field.key}` : field.key;
      nested[at] = [...field.fields.map((f) => f.key), ...(field.correct ? [field.correct] : [])];
      walk(field.fields, at);
    }
  };
  walk(form.fields, '');
  const root = [...new Set([...form.fields.map((f) => f.key), ...WIDGET_COMMON_REQUEST_FIELDS])];
  return { root, nested };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
