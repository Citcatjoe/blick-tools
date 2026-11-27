// Briques communes aux règles des widgets (dashboard et API).

// Rubriques proposées par tous les formulaires du dashboard.
export const WIDGET_THEMES = Object.freeze(['Suisse', 'Inter', 'Sport']);

// Marque des formats où `pme` est désactivée dans le dashboard (calendrier, tinder, quiz).
export const BLICK_ONLY_BRANDS = Object.freeze(['blick']);
export const DEFAULT_BRAND = 'blick';

export const isMissing = (value) => value === undefined || value === null || value === '';
export const isBlank = (value) => typeof value !== 'string' || value.trim() === '';
export const trimOrEmpty = (value) => (typeof value === 'string' ? value.trim() : '');

export const newId = () => globalThis.crypto.randomUUID();

/** Collecteur d'erreurs `{ field, code, message }`, dans l'ordre d'ajout. */
export function errorCollector() {
  const errors = [];
  return {
    errors,
    fail: (field, code, message) => errors.push({ field, code, message }),
  };
}

export function checkTheme(theme, fail) {
  if (isMissing(theme)) {
    fail('theme', 'required', 'La rubrique est obligatoire.');
  } else if (!WIDGET_THEMES.includes(theme)) {
    fail('theme', 'invalid_value', `Rubrique inconnue (valeurs admises : ${WIDGET_THEMES.join(', ')}).`);
  }
}

export function checkBrand(brand, allowed, fail) {
  if (!isMissing(brand) && !allowed.includes(brand)) {
    fail('brand', 'invalid_value', `Marque inconnue (valeurs admises : ${allowed.join(', ')}).`);
  }
}

/** Texte obligatoire : `required` si absent ou vide après rognage, `invalid_type` si non-chaîne. */
export function checkText(value, field, label, fail) {
  if (isMissing(value)) {
    fail(field, 'required', `${label} est obligatoire.`);
  } else if (typeof value !== 'string') {
    fail(field, 'invalid_type', `${label} doit être une chaîne de caractères.`);
  } else if (value.trim() === '') {
    fail(field, 'required', `${label} est obligatoire.`);
  }
}

/** Texte facultatif : seule une valeur non-chaîne est refusée. */
export function checkOptionalText(value, field, label, fail) {
  if (!isMissing(value) && typeof value !== 'string') {
    fail(field, 'invalid_type', `${label} doit être une chaîne de caractères.`);
  }
}

/** Adresse http(s) (même contrôle que le lien global du calendrier). */
export const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

/** Adresse https valide : image du Storage du dashboard ou image que l'API importe. */
export function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

/** Adresse de lien obligatoire, http(s). */
export function checkHttpUrl(value, field, label, fail) {
  checkText(value, field, label, fail);
  if (typeof value === 'string' && value.trim() !== '' && !isHttpUrl(value)) {
    fail(field, 'invalid_value', `${label} doit commencer par http:// ou https://.`);
  }
}

/** Image : obligatoire si `required`, sinon facultative ; toujours une URL https. */
export function checkImage(value, field, label, required, fail) {
  if (isMissing(value)) {
    if (required) fail(field, 'required', `${label} est obligatoire.`);
  } else if (!isHttpsUrl(value)) {
    fail(field, 'invalid_value', `${label} doit être une URL https.`);
  }
}

/** Booléen facultatif. */
export function checkOptionalBoolean(value, field, label, fail) {
  if (!isMissing(value) && typeof value !== 'boolean') {
    fail(field, 'invalid_type', `${label} doit être un booléen.`);
  }
}

/** Date seule obligatoire (`Date`, convertie par l'écrivain). */
export function checkDate(value, field, label, fail) {
  if (isMissing(value)) {
    fail(field, 'required', `${label} est obligatoire.`);
  } else if (!isValidDate(value)) {
    fail(field, 'invalid_value', `${label} est invalide.`);
  }
}

/**
 * Liste obligatoire, `min` éléments au moins, `max` au plus (null = sans maximum).
 * @returns {boolean} vrai si la liste peut être parcourue élément par élément
 */
export function checkList(value, field, { min, max = null, tooFew, tooMany }, fail) {
  if (isMissing(value)) {
    fail(field, 'required', tooFew);
  } else if (!Array.isArray(value)) {
    fail(field, 'invalid_type', 'Une liste est attendue.');
  } else if (value.length < min) {
    fail(field, 'too_few', tooFew);
  } else if (max !== null && value.length > max) {
    fail(field, 'too_many', tooMany);
  } else {
    return true;
  }
  return false;
}

/** Titre multi-ligne : retours à la ligne réels → `\n` littéral, comme le stocke le dashboard. */
export const toLiteralNewlines = (value) => value.trim().replace(/\r\n?/g, '\n').replace(/\n/g, '\\n');

/** Gèle un objet et tout son contenu (descriptions et listes publiées). */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
