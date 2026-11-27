// Règles et construction du widget `potm` (joueur du match), communes au dashboard et à l'API.
// Les équipes proposées viennent de la liste statique `data/teams.json` (équipes nationales et
// clubs de National League), filtrée par contexte (`data/contexts.json`).

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkDate, checkList, checkText, checkTheme, errorCollector, isMissing, isPlainObject, newId, deepFreeze } from './common.js';
import teams from './data/teams.json' with { type: 'json' };
import contexts from './data/contexts.json' with { type: 'json' };

/** Équipes proposées : `{ name, code, color, type: 'national' | 'national_league', img? }`. */
export const POTM_TEAMS = deepFreeze(teams);
/** Contextes : `{ label, type }` ; `type` est la valeur stockée et le `type` des équipes. */
export const POTM_CONTEXTS = deepFreeze(contexts);
export const POTM_CONTEXT_VALUES = Object.freeze(POTM_CONTEXTS.map(({ type }) => type));
export const POTM_DEFAULT_CONTEXT = 'national';
export const POTM_CATEGORIES = Object.freeze(['Messieurs', 'Dames']);
export const POTM_DEFAULT_CATEGORY = 'Messieurs';
export const POTM_MIN_PLAYERS = 2;
/** Postes proposés par le dashboard (valeurs de la requête, accordées à l'enregistrement). */
export const POTM_POSITIONS = Object.freeze(['Attaquant', 'Défenseur', 'Milieu', 'Gardien', 'Entraîneur', 'Entraîneuse']);
export const POTM_DEFAULT_POSITION = 'Attaquant';
// Accord féminin pour la catégorie « Dames » (PotmForm.jsx, getPositionForCategory) ; l'entraîneur
// ou l'entraîneuse garde le poste choisi, quelle que soit l'équipe.
const FEMININE_POSITIONS = Object.freeze({ Attaquant: 'Attaquante', Défenseur: 'Défenseuse', Gardien: 'Gardienne' });
/** Libellés neutres des postes (description du formulaire). */
export const POTM_POSITION_LABELS = Object.freeze({
  Attaquant: 'Attaquant·e', Défenseur: 'Défenseur·euse', Milieu: 'Milieu', Gardien: 'Gardien·ne', Entraîneur: 'Entraîneur', Entraîneuse: 'Entraîneuse',
});

/** Poste stocké : accordé au féminin pour « Dames ». */
export const potmPositionForCategory = (position, category) => (category === 'Dames' ? FEMININE_POSITIONS[position] ?? position : position);

/** Équipes d'un contexte, dans l'ordre de `teams.json`. */
export const potmTeamsForContext = (context) => POTM_TEAMS.filter((team) => team.type === context);

const findTeam = (name) => POTM_TEAMS.find((team) => team.name === name || (typeof name === 'string' && team.name.normalize('NFC').trim() === name.normalize('NFC').trim()));

const checkChoice = (value, field, label, allowed, fail) => {
  if (isMissing(value)) {
    fail(field, 'required', `${label} est obligatoire.`);
  } else if (!allowed.includes(value)) {
    fail(field, 'invalid_value', `${label} : valeur inconnue (valeurs admises : ${allowed.join(', ')}).`);
  }
};

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, contexte, catégorie, match, date,
 * candidats) puis la marque. Par candidat : nom, poste, équipe du contexte choisi.
 *
 * @param {{ theme?: unknown, context?: unknown, category?: unknown, text?: unknown, date?: unknown,
 *   players?: unknown, brand?: unknown }} input
 *   `date` : `Date` (date du match) ; `players` : `[{ id?, name, position, team }]`.
 */
export function validatePotm({ theme, context, category, text, date, players, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkChoice(context, 'context', 'Le contexte', POTM_CONTEXT_VALUES, fail);
  checkChoice(category, 'category', 'La catégorie', POTM_CATEGORIES, fail);
  checkText(text, 'text', 'Le match', fail);
  checkDate(date, 'date', 'La date du match', fail);

  const tooFew = `Au moins ${POTM_MIN_PLAYERS} candidats sont nécessaires.`;
  if (checkList(players, 'players', { min: POTM_MIN_PLAYERS, tooFew }, fail)) {
    const contextKnown = POTM_CONTEXT_VALUES.includes(context);
    players.forEach((player, index) => {
      const at = `players[${index}]`;
      const n = index + 1;
      if (!isPlainObject(player)) {
        fail(at, 'invalid_type', `Le candidat ${n} doit être un objet.`);
        return;
      }
      checkText(player.name, `${at}.name`, `Le nom du candidat ${n}`, fail);
      checkChoice(player.position, `${at}.position`, `Le poste du candidat ${n}`, POTM_POSITIONS, fail);
      if (isMissing(player.team)) {
        fail(`${at}.team`, 'required', `L'équipe du candidat ${n} est obligatoire.`);
      } else {
        const team = findTeam(player.team);
        if (!team) {
          fail(`${at}.team`, 'invalid_value', `L'équipe du candidat ${n} est inconnue.`);
        } else if (contextKnown && team.type !== context) {
          fail(`${at}.team`, 'invalid_value', `L'équipe du candidat ${n} n'appartient pas au contexte choisi.`);
        }
      }
    });
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création : un id par
 * candidat (conservé s'il existe), votes à 0, poste accordé à la catégorie, équipe complétée par
 * `teams.json` (code, couleur, type, logo des clubs de National League). Précondition :
 * `validatePotm` vide.
 *
 * @param {object} input voir `validatePotm`
 * @param {{ toTimestamp: (date: Date) => unknown }} deps horodatage du SDK de l'écrivain
 */
export function buildPotmSaveData({ context, category, text, date, players, brand, theme }, { toTimestamp }) {
  return {
    type: 'potm',
    context: { context, category, text: text.trim(), date: toTimestamp(date) },
    players: players.map((player) => {
      const team = findTeam(player.team);
      return {
        id: player.id || newId(),
        name: player.name.trim(),
        position: potmPositionForCategory(player.position, category),
        team: team ? team.name : player.team,
        code: team ? team.code : '',
        color: team ? team.color : '#000000',
        type: team ? team.type : 'national',
        img: team && team.type === 'national_league' ? team.img || null : null,
        votes: 0,
      };
    }),
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
  };
}
