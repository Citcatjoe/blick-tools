// Règles et construction du widget `folder` (dossier), communes au dashboard et à l'API.

import {
  BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkHttpUrl, checkImage, checkList, checkOptionalBoolean, checkText, checkTheme, errorCollector,
  formCommon, fromLiteralNewlines, isMissing, isPlainObject, newId, optionalText, statsOnEdit, toLiteralNewlines, withoutUndefined,
} from './common.js';

/** Préfixe Storage des images de dossier (ImageUploader du dashboard). */
export const FOLDER_IMAGE_PREFIX = 'folders';
export const FOLDER_MIN_BUTTONS = 1;
export const FOLDER_MAX_BUTTONS = 4;
/** Couleurs du label : valeur de la requête → classe stockée. */
export const FOLDER_LABEL_COLORS = Object.freeze({ brand: 'bg-brand', sport: 'bg-sport' });
export const FOLDER_DEFAULT_LABEL_COLOR = 'brand';

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, label, couleur, titre, image,
 * boutons) puis la marque.
 *
 * @param {{ theme?: unknown, label?: unknown, labelColor?: unknown, name?: unknown, img?: unknown,
 *   buttons?: unknown, brand?: unknown }} input
 *   `name` : retours à la ligne réels ; `buttons` : `[{ id?, text, href, newTab? }]`.
 */
export function validateFolder({ theme, label, labelColor, name, img, buttons, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(label, 'label', 'Le label du dossier', fail);
  if (!isMissing(labelColor) && !Object.hasOwn(FOLDER_LABEL_COLORS, labelColor)) {
    fail('labelColor', 'invalid_value', `Couleur du label inconnue (valeurs admises : ${Object.keys(FOLDER_LABEL_COLORS).join(', ')}).`);
  }
  checkText(name, 'name', 'Le titre du dossier', fail);
  checkImage(img, 'img', "L'image du dossier", true, fail);

  const count = `Le dossier doit avoir de ${FOLDER_MIN_BUTTONS} à ${FOLDER_MAX_BUTTONS} boutons.`;
  if (checkList(buttons, 'buttons', { min: FOLDER_MIN_BUTTONS, max: FOLDER_MAX_BUTTONS, tooFew: count, tooMany: count }, fail)) {
    buttons.forEach((button, index) => {
      const at = `buttons[${index}]`;
      const n = index + 1;
      if (!isPlainObject(button)) {
        fail(at, 'invalid_type', `Le bouton ${n} doit être un objet.`);
        return;
      }
      checkText(button.text, `${at}.text`, `Le texte du bouton ${n}`, fail);
      checkHttpUrl(button.href, `${at}.href`, `Le lien du bouton ${n}`, fail);
      checkOptionalBoolean(button.newTab, `${at}.newTab`, `L'ouverture du bouton ${n} dans un nouvel onglet`, fail);
    });
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création : un id par
 * bouton (conservé s'il existe) et un compteur de clics à 0 par bouton. Précondition :
 * `validateFolder` vide.
 */
export function buildFolderSaveData({ label, labelColor, name, img, buttons, brand, theme }) {
  return {
    type: 'folder',
    folderName: toLiteralNewlines(name),
    folderLabel: label.trim(),
    folderLabelColor: FOLDER_LABEL_COLORS[labelColor || FOLDER_DEFAULT_LABEL_COLOR],
    img,
    buttons: buttons.map((button) => ({
      id: button.id || newId(),
      buttonTxt: button.text.trim(),
      buttonUrl: button.href.trim(),
      buttonOpensNewTab: button.newTab === true,
      buttonCounterClicks: 0,
    })),
    brand: brand || DEFAULT_BRAND,
    theme,
  };
}

/**
 * Document stocké → requête de modification (`PUT /folders/{id}`) : titre avec vrais retours à
 * la ligne, couleur en valeur de la requête (classe inconnue → couleur par défaut), boutons avec
 * leur id.
 */
export function folderFormFromDoc(doc) {
  const data = doc?.data ?? {};
  const labelColor = Object.keys(FOLDER_LABEL_COLORS).find((key) => FOLDER_LABEL_COLORS[key] === data.folderLabelColor);
  return withoutUndefined({
    label: data.folderLabel ?? '',
    labelColor: labelColor ?? FOLDER_DEFAULT_LABEL_COLOR,
    name: fromLiteralNewlines(data.folderName),
    img: optionalText(data.img),
    buttons: (data.buttons ?? []).map((button) => ({
      id: button?.id ?? '',
      text: button?.buttonTxt ?? '',
      href: button?.buttonUrl ?? '',
      newTab: button?.buttonOpensNewTab === true,
    })),
    ...formCommon(doc),
  });
}

/**
 * Clics après modification (transaction du dashboard) : par id de bouton ; à défaut, ceux d'un
 * ancien bouton (même id, même lien et texte, même lien) ; 0 pour un nouveau.
 */
export function folderStatsOnEdit(current, next) {
  const clicks = current?.stats?.buttonClicks || {};
  const legacy = current?.data?.buttons || [];
  return statsOnEdit(current, next, {
    buttonClicks: Object.fromEntries((next.data.buttons ?? []).map((button) => {
      if (clicks[button.id]) return [button.id, clicks[button.id]];
      const old = legacy.find((b) => b.id === button.id)
        || legacy.find((b) => b.buttonUrl === button.buttonUrl && b.buttonTxt === button.buttonTxt)
        || legacy.find((b) => b.buttonUrl === button.buttonUrl);
      return [button.id, old?.buttonCounterClicks || 0];
    })),
  });
}
