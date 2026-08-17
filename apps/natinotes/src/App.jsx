import { useState, useEffect, useCallback } from 'react';
import {
  fetchWidgetData,
  incrementCounterViews,
  dataLayerPushView,
  updatePlayerRatingTransactional
} from '@rms/services';
import Bareme from './components/Bareme';
import PlayerCard from './components/PlayerCard';
import Classement from './components/Classement';

/**
 * Anti-rejeu désactivé en développement : `npm run dev:natinotes` permet de
 * revoter à chaque rechargement. `import.meta.env.DEV` est false dans tout
 * build de production — aucun moyen de contourner le verrou côté lecteur.
 */
const isDev = import.meta.env.DEV;

const storageKey = (docId, playerId) => `hasRated_${docId}_${playerId}`;

/** Notes déjà déposées par ce lecteur, relues depuis localStorage. */
function readStoredRatings(docId, players) {
  if (isDev) return {};
  const stored = {};
  players.forEach((player) => {
    try {
      const value = window.localStorage.getItem(storageKey(docId, player.id));
      if (value != null) stored[player.id] = Number(value);
    } catch {
      // localStorage indisponible (navigation privée, cookies bloqués) :
      // le lecteur pourra revoter, ce qui est préférable à un widget cassé.
    }
  });
  return stored;
}

function App() {
  const [docId, setDocId] = useState(null);
  const [widget, setWidget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Distributions de notes par joueur, tenues à jour après chaque vote
  const [ratings, setRatings] = useState({});
  // Note du lecteur par joueur
  const [readerRatings, setReaderRatings] = useState({});
  const [pendingPlayerId, setPendingPlayerId] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('natinotesDoc');

    if (!id) {
      console.log('Aucun document natinotes trouvé.');
      setLoading(false);
      setError(true);
      return;
    }

    setDocId(id);

    async function load() {
      try {
        const data = await fetchWidgetData(id);
        if (!data) throw new Error('Aucun document trouvé');

        const players = data.data?.players || [];
        setWidget(data);
        setRatings(data.stats?.playerRatings || {});
        setReaderRatings(readStoredRatings(id, players));

        incrementCounterViews(id);
        dataLayerPushView(id, 'NATINOTES');
      } catch (e) {
        console.error('Erreur de chargement du widget natinotes:', e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleRate = useCallback(async (playerId, value) => {
    if (!docId || pendingPlayerId) return;
    setPendingPlayerId(playerId);

    try {
      // La transaction renvoie la distribution à jour : la moyenne affichée
      // inclut donc la note qui vient d'être déposée, sans relecture.
      const distribution = await updatePlayerRatingTransactional(docId, playerId, value);
      setRatings((prev) => ({ ...prev, [playerId]: distribution }));
      setReaderRatings((prev) => ({ ...prev, [playerId]: value }));

      // En dev on n'écrit rien : pas d'entrées résiduelles qui bloqueraient
      // le vote une fois le verrou réactivé.
      if (!isDev) {
        try {
          window.localStorage.setItem(storageKey(docId, playerId), String(value));
        } catch {
          // Sans localStorage, le vote compte quand même — seul l'anti-rejeu saute.
        }
      }
    } catch (e) {
      console.error('Erreur lors de l’envoi de la note:', e);
    } finally {
      setPendingPlayerId(null);
    }
  }, [docId, pendingPlayerId]);

  if (loading) {
    return (
      <main className="text-center">
        <p className="nn-text-weak">Chargement…</p>
      </main>
    );
  }

  if (error || !widget) {
    return (
      <main className="text-center">
        <p className="nn-text-weak">Ce contenu n’est pas disponible.</p>
      </main>
    );
  }

  // `!== false` : un document sans le champ (publié avant l'ajout du réglage)
  // affiche le récap, conformément au défaut activé côté backend.
  const { title, label, players = [], showRecap } = widget.data || {};
  const displayRecap = showRecap !== false;

  return (
    <main>
      {/* <header>
        {label && (
          <p className="nn-text-brand m-0 text-sm font-bold uppercase tracking-wide">
            {label}
          </p>
        )}
        {title && (
          <h1 className="mt-1 mb-0 text-2xl font-extrabold">
            {title}
          </h1>
        )}
      </header> */}

      <div className="mt-0">
        <Bareme />
      </div>

      <div className="mt-2">
        {players.map((player) => (
          <div key={player.id}>
            <PlayerCard
              player={player}
              distribution={ratings[player.id]}
              readerRating={readerRatings[player.id] ?? null}
              isSubmitting={pendingPlayerId === player.id}
              onRate={(value) => handleRate(player.id, value)}
            />
            {/* Séparateur après chaque joueur, dernier inclus */}
            <hr className="m-0 border-0 border-t nn-stroke-weak" />
          </div>
        ))}
      </div>

      {displayRecap && (
        <Classement
          players={players}
          ratings={ratings}
          readerRatings={readerRatings}
        />
      )}
    </main>
  );
}

export default App;
