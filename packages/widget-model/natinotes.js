// Règles et construction du widget `natinotes` (notes des joueurs), communes au dashboard et à
// l'API. Les joueurs viennent des effectifs (collection Firestore `teams`) : le widget garde un
// instantané figé (nom, équipe, portrait, cadrage) recopié de l'effectif à l'enregistrement, et
// l'id du joueur sert de clé à `stats.playerRatings`.

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkList, checkOptionalBoolean, checkText, checkTheme, errorCollector, isMissing, isPlainObject, trimOrEmpty } from './common.js';
import { normalizeFocal } from './portraitFocal.js';
import { checkRichText, sanitizeRichText } from './richtext.js';

/** Barème Blick (et du lecteur), dans l'ordre du menu du dashboard. */
export const NATINOTES_RATINGS = Object.freeze([6, 5, 4, 3, 2, 1]);
export const NATINOTES_MIN_PLAYERS = 1;

const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'fr');

/**
 * Joueurs des effectifs par id : `{ player, team }`. Un id présent dans plusieurs effectifs
 * désigne d'abord son entrée non archivée.
 */
function rosterById(teams) {
  const roster = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    for (const player of Array.isArray(team?.players) ? team.players : []) {
      if (!player || isMissing(player.id)) continue;
      const known = roster.get(player.id);
      if (!known || (known.player.archived && !player.archived)) roster.set(player.id, { player, team });
    }
  }
  return roster;
}

const previousById = (previousPlayers) => new Map((Array.isArray(previousPlayers) ? previousPlayers : []).filter((p) => p && !isMissing(p.id)).map((p) => [p.id, p]));

/**
 * Effectifs proposés au choix d'un joueur (`GET /teams`, sélecteur du Hub) : joueurs archivés
 * exclus, équipes puis joueurs triés par nom, équipe du joueur (sinon nom de l'effectif), portrait
 * (ou null) et cadrage normalisé.
 *
 * @param {Array<{ id: string, name: string, players?: Array<{ id: string, name: string,
 *   team?: string, img?: string | null, focal?: object, archived?: boolean }> }>} teamsDocs
 * @returns {Array<{ id: string, name: string, players: Array<{ id: string, name: string,
 *   team: string, img: string | null, focal: { x: number, y: number, zoom: number } }> }>}
 */
export function listTeamsForPicker(teamsDocs) {
  return (Array.isArray(teamsDocs) ? teamsDocs : [])
    .map((team) => ({
      id: team.id,
      name: team.name,
      players: (Array.isArray(team.players) ? team.players : [])
        .filter((player) => player && !player.archived)
        .map((player) => ({
          id: player.id,
          name: player.name,
          team: player.team || team.name || '',
          img: player.img ?? null,
          focal: normalizeFocal(player.focal),
        }))
        .sort(byName),
    }))
    .sort(byName);
}

/**
 * Toutes les violations, dans l'ordre du formulaire (rubrique, événement, joueurs, récap) puis la
 * marque. Par joueur : id (connu des effectifs, non archivé, unique), note Blick, paragraphe (non
 * vide après nettoyage).
 *
 * @param {{ theme?: unknown, title?: unknown, players?: unknown, showRecap?: unknown,
 *   brand?: unknown }} input `players` : `[{ id, blickRating, comment }]`
 * @param {{ teams?: Array<object>, previousPlayers?: Array<object> }} [deps]
 *   `teams` : documents `teams` ; `previousPlayers` : joueurs déjà enregistrés dans le widget
 *   (édition dashboard), acceptés même archivés ou retirés des effectifs.
 */
export function validateNatinotes({ theme, title, players, showRecap, brand } = {}, { teams = [], previousPlayers = [] } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(title, 'title', "L'événement", fail);

  const tooFew = `Au moins ${NATINOTES_MIN_PLAYERS} joueur est nécessaire.`;
  if (checkList(players, 'players', { min: NATINOTES_MIN_PLAYERS, tooFew }, fail)) {
    const roster = rosterById(teams);
    const previous = previousById(previousPlayers);
    const seen = new Set();
    players.forEach((player, index) => {
      const at = `players[${index}]`;
      const n = index + 1;
      if (!isPlainObject(player)) {
        fail(at, 'invalid_type', `Le joueur ${n} doit être un objet.`);
        return;
      }
      const { id } = player;
      checkText(id, `${at}.id`, `Le joueur ${n}`, fail);
      if (typeof id === 'string' && id.trim() !== '') {
        const entry = roster.get(id);
        if (seen.has(id)) {
          fail(`${at}.id`, 'duplicate', `Le joueur ${n} figure déjà dans la liste.`);
        } else if (!previous.has(id) && !entry) {
          fail(`${at}.id`, 'invalid_value', `Le joueur ${n} est inconnu des effectifs.`);
        } else if (!previous.has(id) && entry.player.archived) {
          fail(`${at}.id`, 'invalid_value', `Le joueur ${n} est archivé dans son effectif.`);
        }
        seen.add(id);
      }
      if (isMissing(player.blickRating)) {
        fail(`${at}.blickRating`, 'required', `La note Blick du joueur ${n} est obligatoire.`);
      } else if (!NATINOTES_RATINGS.includes(player.blickRating)) {
        fail(`${at}.blickRating`, 'invalid_value', `La note Blick du joueur ${n} doit être un entier de 1 à 6.`);
      }
      checkRichText(player.comment, `${at}.comment`, `Le paragraphe du joueur ${n}`, true, fail);
    });
  }

  checkOptionalBoolean(showRecap, 'showRecap', "L'affichage du récap des avis", fail);
  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`, comme Form.jsx en création (vues à 0,
 * `label` vide, distributions de notes vides). Chaque joueur est recopié de son effectif (nom,
 * équipe du joueur ou nom de l'effectif, portrait ou null, cadrage normalisé) ; un joueur absent
 * des effectifs mais déjà enregistré garde son instantané. Paragraphe nettoyé
 * (`sanitizeRichText`). Précondition : `validateNatinotes` vide avec les mêmes `deps`.
 */
export function buildNatinotesSaveData({ title, label, players, showRecap, brand, theme }, { teams = [], previousPlayers = [] } = {}) {
  const roster = rosterById(teams);
  const previous = previousById(previousPlayers);
  return {
    type: 'natinotes',
    title: title.trim(),
    // `label` n'est plus saisi : seul un widget existant en porte encore un
    label: trimOrEmpty(label),
    players: players.map(({ id, blickRating, comment }) => {
      const live = roster.get(id);
      const stored = previous.get(id);
      const snapshot = live
        ? { name: live.player.name, team: live.player.team || live.team?.name, img: live.player.img, focal: live.player.focal ?? stored?.focal }
        : stored;
      return {
        id,
        name: trimOrEmpty(snapshot.name),
        team: snapshot.team || '',
        img: snapshot.img ?? null,
        focal: normalizeFocal(snapshot.focal),
        blickRating,
        comment: sanitizeRichText(comment, { inline: true }),
      };
    }),
    showRecap: showRecap !== false,
    brand: brand || DEFAULT_BRAND,
    theme,
    counterViews: 0,
  };
}
