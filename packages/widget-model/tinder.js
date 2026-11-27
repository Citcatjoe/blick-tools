// Règles et construction du widget `tinder`, communes au dashboard et à l'API.

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkText, checkTheme, errorCollector, isBlank, isMissing, newId, trimOrEmpty } from './common.js';

// Le formulaire du dashboard affiche toujours 3 cartes, sans ajout ni retrait.
export const TINDER_CARDS = 3;

/**
 * Toutes les violations, dans l'ordre du dashboard (rubrique, label, titre, cartes, légende) puis
 * la marque.
 *
 * @param {{ theme?: unknown, label?: unknown, title?: unknown, cards?: unknown,
 *   legend?: { txt?: unknown, display?: unknown }, brand?: unknown }} input
 *   `cards` : `[{ id?, label, title }]`
 */
export function validateTinder({ theme, label, title, cards, legend, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(label, 'label', 'Le label du tinder', fail);
  checkText(title, 'title', 'Le titre du tinder', fail);

  const countMessage = `Le tinder doit avoir exactement ${TINDER_CARDS} cartes.`;
  if (isMissing(cards)) {
    fail('cards', 'required', countMessage);
  } else if (!Array.isArray(cards)) {
    fail('cards', 'invalid_type', 'Les cartes doivent être une liste.');
  } else if (cards.length < TINDER_CARDS) {
    fail('cards', 'too_few', countMessage);
  } else if (cards.length > TINDER_CARDS) {
    fail('cards', 'too_many', countMessage);
  } else {
    cards.forEach((card, index) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) {
        fail(`cards[${index}]`, 'invalid_type', `La carte ${index + 1} doit être un objet.`);
        return;
      }
      checkText(card.label, `cards[${index}].label`, `Le label de la carte ${index + 1}`, fail);
      checkText(card.title, `cards[${index}].title`, `Le titre de la carte ${index + 1}`, fail);
    });
  }

  if (legend && legend.display === true && isBlank(legend.txt)) {
    fail('legend', 'required', 'La légende affichée doit avoir un texte.');
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`. Précondition : `validateTinder` vide.
 * Une carte sans id en reçoit un ; un compteur `{ yes, no }` par carte (repris de `tinderVotes`
 * s'il existe, sinon à zéro). Légende masquée par défaut.
 */
export function buildTinderSaveData({ label, title, cards, legend, tinderVotes, brand, theme }) {
  const tinderCards = cards.map((card) => ({
    id: card.id || newId(),
    tinderCardLabel: card.label.trim(),
    tinderCardTitle: card.title.trim(),
  }));
  return {
    type: 'tinder',
    tinderLabel: label.trim(),
    tinderTitle: title.trim(),
    tinderCards,
    tinderVotes: Object.fromEntries(
      tinderCards.map(({ id }) => [id, tinderVotes?.[id] || { yes: 0, no: 0 }]),
    ),
    tinderLegend: { txt: trimOrEmpty(legend?.txt), display: legend?.display === true },
    brand: brand || DEFAULT_BRAND,
    theme,
  };
}
