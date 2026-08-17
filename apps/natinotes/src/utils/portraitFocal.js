/**
 * Restitution du cadrage d'un portrait côté app cliente.
 *
 * Copie volontaire du helper du backend (`apps/backend/src/data/portraitFocal.js`) :
 * les deux apps sont des dépôts séparés, on ne partage pas encore de package UI.
 * Le réglage `focal` est figé dans le widget à la publication, à côté de `img` ;
 * ici on ne fait que le rejouer en CSS, sans aucune logique d'édition.
 *
 * Le défaut `{ x:50, y:0, zoom:1 }` reproduit l'ancien `object-cover object-top` :
 * un joueur d'un widget publié avant ce réglage s'affiche à l'identique.
 */
export const DEFAULT_FOCAL = { x: 50, y: 0, zoom: 1 };

const clamp = (v, min, max, fallback) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function normalizeFocal(focal) {
  if (!focal || typeof focal !== 'object') return DEFAULT_FOCAL;
  return {
    x: clamp(focal.x, 0, 100, DEFAULT_FOCAL.x),
    y: clamp(focal.y, 0, 100, DEFAULT_FOCAL.y),
    zoom: clamp(focal.zoom, 1, 4, DEFAULT_FOCAL.zoom),
  };
}

/**
 * Style inline pour un `<img className="object-cover">`, à combiner avec un
 * parent `overflow-hidden rounded-full` qui reclippe l'image zoomée au cercle.
 */
export function focalStyle(focal) {
  const f = normalizeFocal(focal);
  return { objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom})` };
}
