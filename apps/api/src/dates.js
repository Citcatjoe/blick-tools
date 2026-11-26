// Date-heure ISO 8601 des calendriers (specs/002-hub-widgets-api, clarification Q3) :
// avec décalage (`Z`, `+01:00`) → instant exact ; sans décalage → heure murale suisse
// (Europe/Zurich, heure d'été gérée), comme la saisie `datetime-local` du dashboard.

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
