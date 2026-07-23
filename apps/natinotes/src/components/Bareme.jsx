const SCALE = [
  [6, 'excellent'],
  [5, 'bon'],
  [4, 'acceptable'],
  [3, 'mauvais'],
  [2, 'très mauvais'],
  [1, 'catastrophique']
];

/**
 * Affiché une seule fois en tête, avant le premier joueur. Défile avec le
 * contenu : rien de fixe, pas de barre collante.
 */
function Bareme() {
  return (
    <section className="nn-fill-weak p-[10px] sm:p-5">
      <h3 className="m-0 text-lg font-bold">
        Barème
      </h3>
      {/* 6 grades sur 2 colonnes, ordonnés de haut en bas dans chaque colonne */}
      <ul className="mt-3 grid grid-flow-col grid-rows-3 gap-x-6 gap-y-1 list-none p-0">
        {SCALE.map(([value, wording]) => (
          <li key={value} className="flex items-baseline gap-3">
            <span className="w-3 text-sm font-bold nn-text-brand">
              {value}
            </span>
            <span className="text-sm font-bold">
              {wording}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default Bareme;
