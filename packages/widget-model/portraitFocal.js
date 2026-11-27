/**
 * Réglage de cadrage d'un portrait (« point focal » + zoom).
 *
 * On ne recadre jamais le fichier : l'original uploadé est conservé tel quel et
 * ce petit réglage est rejoué **en CSS** partout où le portrait s'affiche en
 * pastille circulaire (backend + app cliente natinotes). Trois nombres suffisent :
 *
 *   - `x`, `y` ∈ [0,100] → `object-position` (quelle zone de l'image reste
 *     visible dans le cercle). Exprimés en %, donc identiques à 36 px comme à
 *     72 px : le même réglage rend correctement quelle que soit la taille.
 *   - `zoom` ≥ 1 → `transform: scale()` (resserre sur le visage).
 *
 * Le défaut `{ x:50, y:0, zoom:1 }` reproduit exactement l'ancien
 * `object-cover object-top` : un joueur enregistré avant l'ajout de ce réglage
 * (pas de champ `focal`) s'affiche donc à l'identique.
 */
export const DEFAULT_FOCAL = { x: 50, y: 0, zoom: 1 };

const clamp = (v, min, max, fallback) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Ramène un focal quelconque (ou absent) à une valeur sûre et bornée. */
export function normalizeFocal(focal) {
  if (!focal || typeof focal !== 'object') return { ...DEFAULT_FOCAL };
  return {
    x: clamp(focal.x, 0, 100, DEFAULT_FOCAL.x),
    y: clamp(focal.y, 0, 100, DEFAULT_FOCAL.y),
    zoom: clamp(focal.zoom, 1, 4, DEFAULT_FOCAL.zoom),
  };
}

/**
 * Style inline à appliquer à un `<img className="object-cover">` (ou identique)
 * pour restituer le cadrage. À combiner avec un parent `overflow-hidden
 * rounded-full` : le `scale` fait déborder l'image de sa boîte, le parent la
 * reclippe au cercle.
 */
export function focalStyle(focal) {
  const f = normalizeFocal(focal);
  return { objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom})` };
}
