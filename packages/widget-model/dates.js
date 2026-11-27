// Date-heure ISO 8601 des calendriers (specs/002-hub-widgets-api, clarification Q3) :
// avec décalage (`Z`, `+01:00`) → instant exact ; sans décalage → heure murale suisse
// (Europe/Zurich, heure d'été gérée), comme la saisie `datetime-local` du dashboard.
// Date seule (joueur du match, faits du match — specs/005-hub-all-formats) : midi heure suisse,
// comme le dashboard (`new Date(date + 'T12:00:00')` sur un poste en Suisse). Lecture inverse
// (`formatDate`, `formatDateTime`) pour pré-remplir une modification (specs/006-hub-edit).

export const DEFAULT_TIME_ZONE = 'Europe/Zurich';

const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

const zoneFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Heure murale de `DEFAULT_TIME_ZONE` à l'instant `ms`, exprimée comme un instant UTC fictif. */
function wallClockAsUtc(ms) {
  const parts = Object.fromEntries(zoneFormatter.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * @param {unknown} value
 * @returns {Date | null} `null` si la valeur n'est pas une date-heure ISO 8601 valide, ou si l'heure
 *   n'existe pas en heure suisse (saut de l'heure d'été).
 */
export function parseDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_TIME.exec(value.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, s = '0', fraction = '0', offset] = match;
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms);

  // Composants hors limites (31 février, 25 h…) : Date.UTC les reporte, on les refuse.
  const check = new Date(wall);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d
    || check.getUTCHours() !== +h || check.getUTCMinutes() !== +mi || check.getUTCSeconds() !== +s) {
    return null;
  }

  if (offset) {
    if (offset === 'Z') return new Date(wall);
    const sign = offset[0] === '-' ? -1 : 1;
    const [oh, om] = offset.slice(1).split(':').map(Number);
    if (oh > 23 || om > 59) return null;
    return new Date(wall - sign * (oh * 60 + om) * 60_000);
  }

  // Sans décalage : instant UTC dont l'heure suisse vaut `wall`. Deux itérations suffisent ;
  // si aucune ne retombe sur l'heure demandée, elle n'existe pas (passage à l'heure d'été).
  let utc = wall - (wallClockAsUtc(wall) - wall);
  utc = wall - (wallClockAsUtc(utc) - utc);
  const wallMsPart = wall - Math.floor(wall / 1000) * 1000;
  return wallClockAsUtc(utc - wallMsPart) + wallMsPart === wall ? new Date(utc) : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} value date seule « 2026-12-20 »
 * @returns {Date | null} midi heure suisse ce jour-là ; `null` si la valeur n'est pas une date
 *   seule valide.
 */
export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  return ISO_DATE.test(date) ? parseDateTime(`${date}T12:00`) : null;
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Jour suisse d'un instant, au format de `parseDate` (« 2026-12-20 »). */
export function formatDate(date) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Date et heure suisses d'un instant, au format de `parseDateTime` sans décalage (« 2026-12-20T20:45 »). */
export function formatDateTime(date) {
  const parts = Object.fromEntries(zoneFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Horodatage stocké (Timestamp Firestore, client ou Admin, ou `Date`) → `Date`, sinon null. */
export function timestampToDate(timestamp) {
  if (!timestamp) return null;
  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : timestamp;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}
