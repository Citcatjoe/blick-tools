import { useState, useMemo } from 'react';
import { averageRating, countRatings } from '../utils/ratings';

/** Hauteur d'une ligne, en px. Sert aussi à positionner les lignes par leur rang. */
const ROW_HEIGHT = 30;
const MAX_RATING = 6;

// `variant` mappe l'onglet sur les classes couleur du design system
// (cf. tailwind.css : .nn-tab--* pour le bouton, .nn-view--* pour barres/valeurs).
const TABS = [
  { id: 'blick', label: 'Blick', variant: 'brand' },
  { id: 'reader', label: 'Vous', variant: 'neutral' },
  { id: 'community', label: 'Communauté', variant: 'sport' }
];

/** Note d'un joueur selon le point de vue courant. `null` = pas de note. */
function valueFor(tab, player, distribution, readerRating) {
  if (tab === 'blick') return player.blickRating ?? null;
  if (tab === 'reader') return readerRating ?? null;
  return averageRating(distribution);
}

/**
 * Classement des joueurs selon trois points de vue (spec §5).
 *
 * Aucune donnée supplémentaire n'est nécessaire : les trois vues se calculent
 * à partir de `data.players[].blickRating`, des notes du lecteur et de
 * `stats.playerRatings`.
 *
 * Le classement est toujours complet — un joueur sans note figure en bas,
 * grisé, plutôt que d'être masqué.
 */
function Classement({ players, ratings, readerRatings }) {
  const [activeTab, setActiveTab] = useState('blick');

  // Rang de chaque joueur pour l'onglet courant. L'ordre du DOM ne change
  // jamais (il suit `data.players`) : c'est le rang qui pilote la position,
  // ce qui permet d'animer le réordonnancement sans démonter les nœuds.
  const ranks = useMemo(() => {
    const scored = players.map((player, index) => ({
      id: player.id,
      index,
      value: valueFor(activeTab, player, ratings[player.id], readerRatings[player.id])
    }));

    scored.sort((a, b) => {
      // Les joueurs sans note tombent en bas, dans l'ordre du backend
      if (a.value == null && b.value == null) return a.index - b.index;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      if (b.value !== a.value) return b.value - a.value;
      // Ex æquo départagés par l'ordre éditorial du backend (spec §5)
      return a.index - b.index;
    });

    return Object.fromEntries(scored.map((entry, rank) => [entry.id, rank]));
  }, [players, ratings, readerRatings, activeTab]);

  // Volume de participation, tous joueurs confondus — affiché avec l'onglet Communauté
  const totalRatings = useMemo(() => (
    players.reduce((sum, player) => sum + countRatings(ratings[player.id]), 0)
  ), [players, ratings]);

  if (players.length === 0) return null;

  return (
    <section className="classement mt-6 sm:mt-8 p-2.5 sm:p-5">
      <h3 className="m-0 text-lg font-bold">
        Récap des avis
      </h3>

      <div role="tablist" aria-label="Point de vue" className="mt-3 flex gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === activeTab}
            onClick={() => setActiveTab(item.id)}
            // Spec bouton « small » du design system : h-40, px-16, py-4, pill,
            // gap-8, Inter Bold 14px. Couleurs et survol portés par .nn-tab--*.
            className={`nn-tab nn-tab--${item.variant} flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-1 text-sm font-bold transition-colors`}
          >
            {item.label}
          </button>
        ))}

        {activeTab === 'community' && totalRatings > 0 && (
          <span className="nn-text-weak ml-auto self-center text-xs tabular-nums">
            {totalRatings} {totalRatings > 1 ? 'notes données' : 'note donnée'}
          </span>
        )}
      </div>

      <div className={`nn-view--${activeTab} relative mt-6`} style={{ height: players.length * ROW_HEIGHT }}>
        {players.map((player) => {
          const value = valueFor(activeTab, player, ratings[player.id], readerRatings[player.id]);
          const isRated = value != null;

          return (
            <div
              key={player.id}
              className="natinotes-row absolute inset-x-0 top-0 flex items-center gap-3"
              style={{
                height: ROW_HEIGHT,
                transform: `translateY(${ranks[player.id] * ROW_HEIGHT}px)`,
                opacity: isRated ? 1 : 0.45
              }}
            >
              <span className="nn-text-weak w-28 shrink-0 truncate text-xs sm:text-sm font-base sm:w-36">
                {player.name}
              </span>

              <span className="natinotes-track h-2 flex-1 overflow-hidden">
                <span
                  className="natinotes-bar block h-full"
                  style={{ width: isRated ? `${(value / MAX_RATING) * 100}%` : '0%' }}
                />
              </span>

              <span className={`nn-value w-8 shrink-0 text-right text-sm font-bold tabular-nums ${isRated ? '' : 'nn-value--unrated'}`}>
                {isRated ? value : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Classement;
