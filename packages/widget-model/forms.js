// Description des formulaires de création des formats ouverts à l'API (specs 004 et 005) : champs
// de la requête, type de saisie, libellé et exemple en français, obligation, bornes. Publiée par
// l'API (`GET /widget-types`) : le Hub Rédaction construit ses formulaires à partir d'elle, sans
// recopier les règles. Les règles elles-mêmes restent dans les `validate*` de ce package ; les
// bornes d'ici réutilisent leurs constantes, et les tests (test/forms.test.js, apps/api/test/
// forms.test.js) vérifient que les deux disent la même chose. Le dashboard garde ses propres
// formulaires.
//
// Types de champ (`kind`) :
//   text, textarea  texte ; url : adresse http(s) ; checkbox : booléen ;
//   datetime        date et heure suisses, sans décalage (« 2026-12-20T20:45 ») ;
//   date            date seule (« 2026-12-20 »), enregistrée à midi heure suisse ;
//   number          nombre entier ; `min` / `max` facultatifs ;
//   image           adresse https d'une image (le Hub l'envoie d'abord par `POST /images`) ;
//   richtext        HTML restreint : paragraphes, retours à la ligne, gras, italique, liens http(s)
//                   (nettoyé par `sanitizeRichText`) ; `inline: true` : sans paragraphes
//                   (`<br>` seulement). Outils proposés : gras, italique, lien ;
//   choice          une valeur parmi `options` (`{ value, label }`) ; `emptyLabel` : choix « vide »
//                   (champ absent). Sans `options` :
//                   - `source: 'teams'` : joueurs des effectifs (`GET /teams`), groupés par équipe ;
//                     la valeur est l'id du joueur ;
//                   - `dependsOn: '<clé racine>'` + `optionsBy: { <valeur de cette clé>: options }` :
//                     options selon la valeur choisie pour l'autre champ ;
//   list            liste d'éléments (`fields`), ou de textes si `item` est donné ; `min` / `max`
//                   (null = sans maximum) ; `correct` : clé booléenne vraie sur un seul élément
//                   (erreur sur `<liste parente>.correctAnswer`) ; `variants` : éléments de
//                   plusieurs sortes, `{ key, label, options: [{ value, label, max?, fields,
//                   defaults? }] }` : chaque élément porte la clé `key` (sa sorte), les champs
//                   communs `fields` de la liste puis ceux de sa sorte ; `max` : nombre maximum
//                   d'éléments de cette sorte ; `defaults` : valeurs posées quand on la choisit ;
//   group           objet (`fields`) ; `optional` : absent si tous ses textes sont vides.
// `titleField` : champ qui identifie le widget (titre de l'Embeddable), ou liste de champs joints par
// « - » (pronostic). `required` : obligatoire. `default` : valeur proposée au départ. `images.prefix` : dossier de
// stockage des images du format. Champs communs non saisis ici : `author` (fixé par le Hub) et
// `brand` (proposée seulement quand il y a un choix).

import { WIDGET_THEMES, BLICK_ONLY_BRANDS, deepFreeze } from './common.js';
import { POLL_BRANDS } from './poll.js';
import { CALENDAR_MAX_ELEMENTS_CHOICE } from './calendar.js';
import { TINDER_CARDS } from './tinder.js';
import { QUIZ_ANSWERS_PER_QUESTION, QUIZ_CONCLUSION_KEYS, QUIZ_CONCLUSION_RANGES, QUIZ_IMAGE_PREFIX } from './quiz.js';
import { TEASER_IMAGE_PREFIX } from './teaser.js';
import { FOLDER_DEFAULT_LABEL_COLOR, FOLDER_IMAGE_PREFIX, FOLDER_MAX_BUTTONS, FOLDER_MIN_BUTTONS } from './folder.js';
import { NATINOTES_MIN_PLAYERS, NATINOTES_RATINGS } from './natinotes.js';
import {
  POTM_CATEGORIES, POTM_CONTEXTS, POTM_DEFAULT_CATEGORY, POTM_DEFAULT_CONTEXT, POTM_DEFAULT_POSITION,
  POTM_MIN_PLAYERS, POTM_POSITIONS, POTM_POSITION_LABELS, potmTeamsForContext,
} from './potm.js';
import { PRONO_COMPETITIONS, PRONO_TEAMS } from './prono.js';
import {
  FACTS_ICONS, FACTS_IMAGE_PREFIX, FACTS_ITEM_DEFAULTS, FACTS_ITEM_TYPES, FACTS_ITEM_TYPE_LABELS,
  FACTS_MAX_RATING_ITEMS, FACTS_MIN_ITEMS,
} from './facts.js';

// Faits marquants : champs de chaque sorte d'élément, dans l'ordre de FACTS_ITEM_FIELDS.
const factsIcon = {
  key: 'icon',
  kind: 'choice',
  label: 'Icône',
  required: true,
  options: FACTS_ICONS.map(({ id, name }) => ({ value: id, label: name })),
};
const factsTitle = { key: 'title', kind: 'text', label: 'Titre', placeholder: "L'action de la soirée", required: true };
const FACTS_VARIANT_FIELDS = {
  normal: [
    factsIcon,
    factsTitle,
    { key: 'text', kind: 'richtext', label: 'Contenu', placeholder: 'Le but de la victoire à la 58e minute…', required: true },
  ],
  quote: [
    factsIcon,
    { ...factsTitle, placeholder: 'La phrase de la soirée' },
    { key: 'text', kind: 'richtext', inline: true, label: 'Citation', placeholder: 'On a montré du caractère ce soir.', required: true },
    { key: 'author', kind: 'text', label: 'Auteur', placeholder: '– Geoff Ward, entraîneur du LHC', required: true },
    { key: 'picture', kind: 'image', label: 'Personne détourée', required: false },
  ],
  picture: [
    factsIcon,
    { ...factsTitle, placeholder: "L'image de la soirée" },
    { key: 'src', kind: 'image', label: 'Image', required: true },
    { key: 'text', kind: 'richtext', label: 'Contenu', placeholder: 'La joie des supporters après le coup de sifflet final.', required: true },
    { key: 'caption', kind: 'text', label: 'Crédit', placeholder: 'Photo: Getty Images', required: true },
  ],
  number: [
    factsIcon,
    { ...factsTitle, placeholder: 'Le chiffre de la soirée' },
    { key: 'value', kind: 'number', label: 'Chiffre', placeholder: '16', required: true },
    { key: 'text', kind: 'text', label: 'Description', placeholder: 'Le nombre de minutes jouées…', required: true },
  ],
  rating: [
    { key: 'title', kind: 'text', label: 'Question posée', placeholder: 'Et vous, comment noteriez-vous cette rencontre?', required: true },
  ],
};

const BRAND_LABELS = { blick: 'Blick', pme: 'PME' };

const theme = Object.freeze({
  key: 'theme',
  kind: 'choice',
  label: 'Rubrique',
  required: true,
  options: WIDGET_THEMES.map((value) => ({ value, label: value })),
});

// Pronostic : les deux équipes se choisissent dans la même liste.
const pronoTeamOptions = PRONO_TEAMS.map(({ name }) => ({ value: name, label: name }));

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
    images: { prefix: QUIZ_IMAGE_PREFIX },
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
  {
    type: 'teaser',
    resource: 'teasers',
    name: 'Teaser',
    noun: 'teaser',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    images: { prefix: TEASER_IMAGE_PREFIX },
    fields: [
      { key: 'label', kind: 'text', label: 'Label du teaser', placeholder: 'Groenland', required: true },
      { key: 'title', kind: 'textarea', label: 'Titre du teaser', placeholder: 'Ce pays que Trump veut prendre par la force', required: true },
      { key: 'img', kind: 'image', label: 'Image du teaser', required: true },
      {
        key: 'button',
        kind: 'group',
        label: "Bouton d'action",
        required: true,
        fields: [
          { key: 'text', kind: 'text', label: 'Texte du bouton', placeholder: "Vers l'article", required: true },
          { key: 'href', kind: 'url', label: 'Lien du bouton', placeholder: 'https://www.blick.ch/fr/…', required: true },
          { key: 'newTab', kind: 'checkbox', label: 'Ouvrir dans un nouvel onglet', required: false, default: false },
        ],
      },
      theme,
    ],
  },
  {
    type: 'folder',
    resource: 'folders',
    name: 'Dossier',
    noun: 'dossier',
    titleField: 'name',
    brands: [...BLICK_ONLY_BRANDS],
    images: { prefix: FOLDER_IMAGE_PREFIX },
    fields: [
      { key: 'label', kind: 'text', label: 'Label du dossier', placeholder: 'Jeux Olympiques', required: true },
      {
        key: 'labelColor',
        kind: 'choice',
        label: 'Couleur du label',
        required: false,
        default: FOLDER_DEFAULT_LABEL_COLOR,
        options: [{ value: 'brand', label: 'Blick' }, { value: 'sport', label: 'Sport' }],
      },
      { key: 'name', kind: 'textarea', label: 'Titre du dossier', placeholder: 'Ne manquez aucune information sur les Jeux Olympiques', required: true },
      { key: 'img', kind: 'image', label: 'Image du dossier', required: true },
      {
        key: 'buttons',
        kind: 'list',
        label: 'Boutons',
        itemLabel: 'Bouton',
        addLabel: 'Ajouter un bouton',
        min: FOLDER_MIN_BUTTONS,
        max: FOLDER_MAX_BUTTONS,
        fields: [
          { key: 'text', kind: 'text', label: 'Texte du bouton', placeholder: 'Tous les résultats', required: true },
          { key: 'href', kind: 'url', label: 'Lien du bouton', placeholder: 'https://www.blick.ch/fr/…', required: true },
          { key: 'newTab', kind: 'checkbox', label: 'Ouvrir dans un nouvel onglet', required: false, default: false },
        ],
      },
      theme,
    ],
  },
  {
    type: 'natinotes',
    resource: 'natinotes',
    name: 'NatiNotes',
    noun: 'NatiNotes',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      { key: 'title', kind: 'text', label: 'Événement', placeholder: 'Notes du match Suisse - France du 13.02.2026', required: true },
      {
        key: 'players',
        kind: 'list',
        label: 'Joueurs',
        itemLabel: 'Joueur',
        addLabel: 'Ajouter un joueur',
        min: NATINOTES_MIN_PLAYERS,
        max: null,
        fields: [
          { key: 'id', kind: 'choice', label: 'Joueur', required: true, source: 'teams' },
          {
            key: 'blickRating',
            kind: 'choice',
            label: 'Note Blick',
            required: true,
            options: NATINOTES_RATINGS.map((value) => ({ value, label: String(value) })),
          },
          { key: 'comment', kind: 'richtext', inline: true, label: 'Paragraphe', placeholder: 'Son match en quelques lignes…', required: true },
        ],
      },
      { key: 'showRecap', kind: 'checkbox', label: 'Afficher le récap des avis', required: false, default: true },
      theme,
    ],
  },
  {
    type: 'potm',
    resource: 'potms',
    name: 'Joueur·euse du match',
    noun: 'joueur·euse du match',
    titleField: 'text',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      {
        key: 'context',
        kind: 'choice',
        label: 'Contexte',
        required: true,
        default: POTM_DEFAULT_CONTEXT,
        options: POTM_CONTEXTS.map(({ type, label }) => ({ value: type, label })),
      },
      {
        key: 'category',
        kind: 'choice',
        label: 'Catégorie',
        required: true,
        default: POTM_DEFAULT_CATEGORY,
        options: POTM_CATEGORIES.map((value) => ({ value, label: value })),
      },
      { key: 'text', kind: 'text', label: 'Match', placeholder: 'Suisse - Canada', required: true },
      { key: 'date', kind: 'date', label: 'Date du match', required: true },
      {
        key: 'players',
        kind: 'list',
        label: 'Candidats',
        itemLabel: 'Candidat',
        addLabel: 'Ajouter un candidat',
        min: POTM_MIN_PLAYERS,
        max: null,
        fields: [
          { key: 'name', kind: 'text', label: 'Nom', placeholder: 'Nico Hischier', required: true },
          {
            key: 'position',
            kind: 'choice',
            label: 'Poste',
            required: true,
            default: POTM_DEFAULT_POSITION,
            options: POTM_POSITIONS.map((value) => ({ value, label: POTM_POSITION_LABELS[value] })),
          },
          {
            key: 'team',
            kind: 'choice',
            label: 'Équipe',
            required: true,
            dependsOn: 'context',
            optionsBy: Object.fromEntries(POTM_CONTEXTS.map(({ type }) => [
              type,
              potmTeamsForContext(type).map(({ name }) => ({ value: name, label: name })),
            ])),
          },
        ],
      },
      theme,
    ],
  },
  {
    type: 'facts',
    resource: 'facts',
    name: 'Faits marquants',
    noun: 'faits marquants',
    titleField: 'title',
    brands: [...BLICK_ONLY_BRANDS],
    images: { prefix: FACTS_IMAGE_PREFIX },
    fields: [
      { key: 'title', kind: 'text', label: 'Rencontre', placeholder: 'Ajoie - Lausanne', required: true },
      { key: 'date', kind: 'date', label: 'Date', required: true },
      {
        key: 'items',
        kind: 'list',
        label: 'Faits marquants',
        itemLabel: 'Fait marquant',
        addLabel: 'Ajouter un fait marquant',
        min: FACTS_MIN_ITEMS,
        max: null,
        fields: [],
        variants: {
          key: 'type',
          label: 'Type',
          options: FACTS_ITEM_TYPES.map((value) => ({
            value,
            label: FACTS_ITEM_TYPE_LABELS[value],
            ...(value === 'rating' ? { max: FACTS_MAX_RATING_ITEMS } : {}),
            fields: FACTS_VARIANT_FIELDS[value],
            defaults: { ...FACTS_ITEM_DEFAULTS[value] },
          })),
        },
      },
      theme,
    ],
  },
  {
    type: 'prono',
    resource: 'pronos',
    name: 'Pronostic',
    noun: 'pronostic',
    titleField: ['team1', 'team2'], // titre de l'Embeddable : « Suisse - Italie », comme meta.title
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      {
        key: 'event',
        kind: 'choice',
        label: 'Compétition',
        required: true,
        options: PRONO_COMPETITIONS.map(({ name }) => ({ value: name, label: name })),
      },
      { key: 'date', kind: 'date', label: 'Date du match', required: true },
      { key: 'team1', kind: 'choice', label: 'Équipe 1', required: true, options: pronoTeamOptions },
      { key: 'team2', kind: 'choice', label: 'Équipe 2', required: true, options: pronoTeamOptions },
      theme,
    ],
  },
  {
    type: 'testimony',
    resource: 'testimonies',
    name: 'Appel à témoignage',
    noun: 'appel à témoignage',
    titleField: 'subject',
    brands: [...BLICK_ONLY_BRANDS],
    fields: [
      { key: 'title', kind: 'text', label: 'Titre de la box', placeholder: 'Votre avis nous intéresse', required: true },
      { key: 'subject', kind: 'text', label: 'Sujet', placeholder: 'Hausse des primes maladie', required: true },
      { key: 'question', kind: 'textarea', label: 'Question aux lecteurs', placeholder: 'Comment faites-vous face à la hausse de vos primes ? Racontez-nous.', required: true },
      { key: 'timeExpires', kind: 'datetime', label: 'Date limite de réponse', required: false },
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
      const variantFields = field.variants ? field.variants.options.flatMap((option) => option.fields) : [];
      nested[at] = [...new Set([
        ...(field.variants ? [field.variants.key] : []),
        ...field.fields.map((f) => f.key),
        ...variantFields.map((f) => f.key),
        ...(field.correct ? [field.correct] : []),
      ])];
      walk([...field.fields, ...variantFields], at);
    }
  };
  walk(form.fields, '');
  const root = [...new Set([...form.fields.map((f) => f.key), ...WIDGET_COMMON_REQUEST_FIELDS])];
  return { root, nested };
}
