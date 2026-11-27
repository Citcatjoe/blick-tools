// Règles et construction du widget `testimony` (appel à témoignage), communes au dashboard et à
// l'API. Les messages des lecteurs (sous-collection `messages`) ne passent jamais par ici.

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkText, checkTheme, errorCollector, isMissing, isValidDate } from './common.js';

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, titre de la box, sujet, question,
 * date limite) puis la marque.
 *
 * @param {{ theme?: unknown, title?: unknown, subject?: unknown, question?: unknown,
 *   timeExpires?: unknown, brand?: unknown }} input `timeExpires` : `Date` facultative.
 */
export function validateTestimony({ theme, title, subject, question, timeExpires, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(title, 'title', 'Le titre de la box', fail);
  checkText(subject, 'subject', 'Le sujet', fail);
  checkText(question, 'question', 'La question aux lecteurs', fail);
  if (!isMissing(timeExpires) && !isValidDate(timeExpires)) {
    fail('timeExpires', 'invalid_value', 'La date limite de réponse est invalide.');
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création (vues et
 * messages reçus à 0 ; sans date limite : `timeExpires` null). Précondition : `validateTestimony`
 * vide.
 *
 * @param {object} input voir `validateTestimony`
 * @param {{ toTimestamp: (date: Date) => unknown }} deps horodatage du SDK de l'écrivain
 */
export function buildTestimonySaveData({ title, subject, question, timeExpires, brand, theme }, { toTimestamp }) {
  return {
    type: 'testimony',
    title: title.trim(),
    subject: subject.trim(),
    question: question.trim(),
    timeExpires: isMissing(timeExpires) ? null : toTimestamp(timeExpires),
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
    counterMsgSent: 0,
  };
}
