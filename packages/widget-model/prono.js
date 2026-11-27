// Règles et construction du widget `prono` (pronostic), communes au dashboard et à l'API.
// Compétitions : liste statique `data/competitions.json` ; équipes : équipes nationales de
// `data/teams.json` (comme PronoForm.jsx).

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkDate, checkTheme, errorCollector, isMissing, deepFreeze } from './common.js';
import { POTM_TEAMS } from './potm.js';
import competitions from './data/competitions.json' with { type: 'json' };

/** Compétitions proposées : `{ name }` ; le nom est la valeur stockée (`pronoData.event`). */
export const PRONO_COMPETITIONS = deepFreeze(competitions);
/** Équipes proposées : les équipes nationales de `teams.json`, dans son ordre. */
export const PRONO_TEAMS = Object.freeze(POTM_TEAMS.filter((team) => team.type === 'national'));
/** Couleur d'une équipe sans couleur dans `teams.json` (valeur initiale de PronoForm.jsx). */
export const PRONO_DEFAULT_COLOR = '#000000';
/** Votes posés à la création sur chaque issue (équipe 1, équipe 2, match nul), comme Form.jsx. */
export const PRONO_INITIAL_VOTES = 1;

const COMPETITION_NAMES = PRONO_COMPETITIONS.map(({ name }) => name);
const TEAM_NAMES = PRONO_TEAMS.map(({ name }) => name);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const checkChoice = (value, field, label, allowed, fail) => {
  if (isMissing(value)) {
    fail(field, 'required', `${label} est obligatoire.`);
  } else if (!allowed.includes(value)) {
    fail(field, 'invalid_value', `${label} : valeur inconnue.`);
  }
};

// Couleur choisie dans le dashboard (sélecteur de couleur) ; l'API ne la reçoit pas.
const checkOptionalColor = (value, field, label, fail) => {
  if (!isMissing(value) && (typeof value !== 'string' || !HEX_COLOR.test(value))) {
    fail(field, 'invalid_value', `${label} doit être une couleur #RRGGBB.`);
  }
};

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, compétition, date, équipes) puis la
 * marque. Les deux équipes peuvent être identiques (comme dans le dashboard).
 *
 * @param {{ theme?: unknown, event?: unknown, date?: unknown, team1?: unknown, team2?: unknown,
 *   color1?: unknown, color2?: unknown, brand?: unknown }} input
 *   `date` : `Date` (date du match) ; `color1` / `color2` : couleurs choisies dans le dashboard.
 */
export function validateProno({ theme, event, date, team1, team2, color1, color2, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkChoice(event, 'event', 'La compétition', COMPETITION_NAMES, fail);
  checkDate(date, 'date', 'La date du match', fail);
  checkChoice(team1, 'team1', "L'équipe 1", TEAM_NAMES, fail);
  checkOptionalColor(color1, 'color1', "La couleur de l'équipe 1", fail);
  checkChoice(team2, 'team2', "L'équipe 2", TEAM_NAMES, fail);
  checkOptionalColor(color2, 'color2', "La couleur de l'équipe 2", fail);

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

const pronoItem = (name, color) => {
  const team = PRONO_TEAMS.find((t) => t.name === name);
  return { name, code: team.code, type: team.type, color: color || team.color || PRONO_DEFAULT_COLOR, votes: PRONO_INITIAL_VOTES };
};

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création : équipes
 * complétées par `teams.json` (code, type, couleur de l'équipe sauf couleur choisie), un vote sur
 * chaque issue (`transformWidgetData` les range dans `stats.itemVotes`). Précondition :
 * `validateProno` vide.
 *
 * @param {object} input voir `validateProno`
 * @param {{ toTimestamp: (date: Date) => unknown }} deps horodatage du SDK de l'écrivain
 */
export function buildPronoSaveData({ event, date, team1, team2, color1, color2, brand, theme }, { toTimestamp }) {
  return {
    type: 'prono',
    pronoData: {
      event,
      date: toTimestamp(date),
      item1: pronoItem(team1, color1),
      item2: pronoItem(team2, color2),
      item3: { votes: PRONO_INITIAL_VOTES },
    },
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
  };
}
