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
