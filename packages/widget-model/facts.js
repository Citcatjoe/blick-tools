// Règles et construction du widget `facts` (faits marquants d'une rencontre), communes au
// dashboard et à l'API. Chaque élément a un type (FactsForm.jsx) qui fixe ses champs ; au plus un
// élément « Note du match » (`rating`) par widget.

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkDate, checkImage, checkList, checkText, checkTheme, errorCollector, isMissing, isPlainObject, newId, deepFreeze } from './common.js';
import { checkRichText, escapeHtmlText, sanitizeRichText } from './richtext.js';
import icons from './data/factsIcons.json' with { type: 'json' };

/** Préfixe Storage des images des faits marquants (préfixe actuel du dashboard). */
export const FACTS_IMAGE_PREFIX = 'factss';
/** Icônes : `{ id, name, svg }`. */
export const FACTS_ICONS = deepFreeze(icons);
export const FACTS_ICON_IDS = Object.freeze(FACTS_ICONS.map(({ id }) => id));
export const FACTS_MIN_ITEMS = 1;
export const FACTS_MAX_RATING_ITEMS = 1;
export const FACTS_ITEM_TYPES = Object.freeze(['normal', 'quote', 'picture', 'number', 'rating']);
export const FACTS_ITEM_TYPE_LABELS = Object.freeze({ normal: 'Normal', quote: 'Citation', picture: 'Image', number: 'Chiffre', rating: 'Note du match' });
/** Champs de chaque type, dans l'ordre du formulaire (hors `type`). */
export const FACTS_ITEM_FIELDS = deepFreeze({
  normal: ['icon', 'title', 'text'],
  quote: ['icon', 'title', 'text', 'author', 'picture'],
  picture: ['icon', 'title', 'src', 'text', 'caption'],
  number: ['icon', 'title', 'value', 'text'],
  rating: ['title'],
});
/** Icône et titre posés quand on choisit le type (FactsForm.jsx, handleTypeChange). */
export const FACTS_ITEM_DEFAULTS = deepFreeze({
  normal: { icon: 'iconCross', title: "L'action de la soirée" },
  quote: { icon: 'iconQuote', title: 'La phrase de la soirée' },
  picture: { icon: 'iconEye', title: "L'image de la soirée" },
  number: { icon: 'iconHashtag', title: 'Le chiffre de la soirée' },
  rating: { title: 'Et vous, comment noteriez-vous cette rencontre?' },
});
/** Icône stockée pour la note du match (non choisie, hors liste des icônes). */
export const FACTS_RATING_ICON = 'iconCheck';

const ALL_ITEM_FIELDS = [...new Set(Object.values(FACTS_ITEM_FIELDS).flat())];

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, rencontre, date, faits marquants)
 * puis la marque. Par élément : type, champs de son type, champ d'un autre type présent
 * (`unknown_field`), au plus une note du match.
 *
 * @param {{ theme?: unknown, title?: unknown, date?: unknown, items?: unknown, brand?: unknown }} input
 *   `date` : `Date` ; `items` : `[{ id?, type, icon, title, text, author, picture, src, caption, value }]`
 *   (champs selon le type).
 */
export function validateFacts({ theme, title, date, items, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(title, 'title', 'La rencontre', fail);
  checkDate(date, 'date', 'La date', fail);

  const tooFew = `Au moins ${FACTS_MIN_ITEMS} fait marquant est nécessaire.`;
  if (checkList(items, 'items', { min: FACTS_MIN_ITEMS, tooFew }, fail)) {
    let ratings = 0;
    items.forEach((item, index) => {
      const at = `items[${index}]`;
      const n = index + 1;
      if (!isPlainObject(item)) {
        fail(at, 'invalid_type', `Le fait marquant ${n} doit être un objet.`);
        return;
      }
      const { type } = item;
      if (isMissing(type)) {
        fail(`${at}.type`, 'required', `Le type du fait marquant ${n} est obligatoire.`);
        return;
      }
      if (!FACTS_ITEM_TYPES.includes(type)) {
        fail(`${at}.type`, 'invalid_value', `Type du fait marquant ${n} inconnu (valeurs admises : ${FACTS_ITEM_TYPES.join(', ')}).`);
        return;
      }
      if (type === 'rating' && ++ratings > FACTS_MAX_RATING_ITEMS) {
        fail(`${at}.type`, 'too_many', `Une seule « ${FACTS_ITEM_TYPE_LABELS.rating} » est possible par widget.`);
      }
      const fields = FACTS_ITEM_FIELDS[type];
      for (const key of fields) checkItemField(item, key, type, `${at}.${key}`, n, fail);
      for (const key of ALL_ITEM_FIELDS) {
        if (!fields.includes(key) && !isMissing(item[key])) {
          fail(`${at}.${key}`, 'unknown_field', `Le champ « ${key} » ne s'applique pas à un fait marquant de type « ${FACTS_ITEM_TYPE_LABELS[type]} ».`);
        }
      }
    });
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

function checkItemField(item, key, type, field, n, fail) {
  const value = item[key];
  switch (key) {
    case 'icon':
      if (isMissing(value)) fail(field, 'required', `L'icône du fait marquant ${n} est obligatoire.`);
      else if (!FACTS_ICON_IDS.includes(value)) fail(field, 'invalid_value', `Icône du fait marquant ${n} inconnue (valeurs admises : ${FACTS_ICON_IDS.join(', ')}).`);
      break;
    case 'title':
      checkText(value, field, type === 'rating' ? `La question posée du fait marquant ${n}` : `Le titre du fait marquant ${n}`, fail);
      break;
    case 'text':
      if (type === 'number') checkText(value, field, `La description du fait marquant ${n}`, fail);
      else checkRichText(value, field, type === 'quote' ? `La citation du fait marquant ${n}` : `Le contenu du fait marquant ${n}`, type === 'quote', fail);
      break;
    case 'author':
      checkText(value, field, `L'auteur du fait marquant ${n}`, fail);
      break;
    case 'caption':
      checkText(value, field, `Le crédit du fait marquant ${n}`, fail);
      break;
    case 'picture':
      checkImage(value, field, `La personne détourée du fait marquant ${n}`, false, fail);
      break;
    case 'src':
      checkImage(value, field, `L'image du fait marquant ${n}`, true, fail);
      break;
    case 'value':
      if (isMissing(value)) fail(field, 'required', `Le chiffre du fait marquant ${n} est obligatoire.`);
      else if (!Number.isInteger(value)) fail(field, 'invalid_value', `Le chiffre du fait marquant ${n} doit être un nombre entier.`);
      break;
  }
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création : un id par
 * élément (conservé s'il existe), textes enrichis nettoyés (`sanitizeRichText`, sans paragraphes
 * pour une citation), description d'un chiffre échappée, `ratingStats` vide s'il y a une note du
 * match (ou `ratingStats` reçu, édition dashboard). Précondition : `validateFacts` vide.
 *
 * @param {object} input voir `validateFacts` (+ `ratingStats` facultatif)
 * @param {{ toTimestamp: (date: Date) => unknown }} deps horodatage du SDK de l'écrivain
 */
export function buildFactsSaveData({ title, date, items, ratingStats, brand, theme }, { toTimestamp }) {
  const savedItems = items.map((item) => {
    const { type } = item;
    const saved = {
      id: item.id || newId(),
      icon: type === 'rating' ? FACTS_RATING_ICON : item.icon,
      title: item.title.trim(),
      type,
      text: itemText(item),
      votes: 0,
    };
    if (type === 'quote') {
      saved.author = item.author.trim();
      if (item.picture) saved.picture = item.picture;
    }
    if (type === 'picture') {
      saved.caption = item.caption.trim();
      saved.src = item.src;
    }
    if (type === 'number') saved.value = item.value;
    return saved;
  });
  const saveData = {
    type: 'facts',
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
    factsData: { rencontre: title.trim(), date: toTimestamp(date), items: savedItems },
  };
  if (ratingStats !== undefined) saveData.ratingStats = ratingStats;
  else if (savedItems.some((item) => item.type === 'rating')) saveData.ratingStats = {};
  return saveData;
}

function itemText({ type, text }) {
  if (type === 'rating') return '';
  if (type === 'number') return escapeHtmlText(text.trim());
  return sanitizeRichText(text, { inline: type === 'quote' });
}
