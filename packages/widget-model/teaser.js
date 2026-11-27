// Règles et construction du widget `teaser`, communes au dashboard et à l'API.

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkHttpUrl, checkImage, checkOptionalBoolean, checkText, checkTheme, errorCollector, isPlainObject, toLiteralNewlines } from './common.js';

/** Préfixe Storage des images de teaser (ImageUploader du dashboard). */
export const TEASER_IMAGE_PREFIX = 'teasers';

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, label, titre, image, bouton) puis
 * la marque.
 *
 * @param {{ theme?: unknown, label?: unknown, title?: unknown, img?: unknown,
 *   button?: { text?: unknown, href?: unknown, newTab?: unknown }, brand?: unknown }} input
 *   `title` : retours à la ligne réels.
 */
export function validateTeaser({ theme, label, title, img, button, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(label, 'label', 'Le label du teaser', fail);
  checkText(title, 'title', 'Le titre du teaser', fail);
  checkImage(img, 'img', "L'image du teaser", true, fail);

  const { text, href, newTab } = isPlainObject(button) ? button : {};
  checkText(text, 'button.text', 'Le texte du bouton', fail);
  checkHttpUrl(href, 'button.href', 'Le lien du bouton', fail);
  checkOptionalBoolean(newTab, 'button.newTab', "L'ouverture dans un nouvel onglet", fail);

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création (compteurs à
 * 0). Précondition : `validateTeaser` vide. Le titre garde ses retours à la ligne en `\n` littéral.
 */
export function buildTeaserSaveData({ label, title, img, button, brand, theme }) {
  return {
    type: 'teaser',
    teaserLabel: label.trim(),
    teaserTitle: toLiteralNewlines(title),
    linkGlobalTxt: button.text.trim(),
    linkGlobalHref: button.href.trim(),
    linkGlobalNewTab: button.newTab === true,
    img,
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
    counterClicks: 0,
  };
}
