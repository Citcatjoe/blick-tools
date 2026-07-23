/**
 * Helpers de lecture de `stats.playerRatings`, dont la forme est une
 * distribution par joueur puis par valeur de note :
 *   { "denis-zakaria": { "5": 40, "6": 8 }, … }
 */

/** Total des notes déposées pour un joueur. */
export function countRatings(distribution) {
  return Object.values(distribution || {}).reduce(
    (sum, n) => sum + (typeof n === 'number' ? n : 0), 0
  );
}

/** Moyenne communautaire, arrondie à une décimale. `null` si aucune note. */
export function averageRating(distribution) {
  const total = countRatings(distribution);
  if (!total) return null;
  const sum = Object.entries(distribution).reduce(
    (acc, [value, count]) => acc + Number(value) * count, 0
  );
  return Math.round((sum / total) * 10) / 10;
}
