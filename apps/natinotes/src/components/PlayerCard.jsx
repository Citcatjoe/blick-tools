import defaultPortrait from '../assets/default.jpg';
import { countRatings, averageRating } from '../utils/ratings';

const RATINGS = [6, 5, 4, 3, 2, 1];

function Badge({ value, variant }) {
  // La moyenne tient 3 caractères (« 5.1 ») : sa pastille peut s'élargir, mais
  // `min-w-9` (= sa hauteur) garantit un cercle parfait quand elle n'affiche qu'« 4 ».
  const shape = variant === 'community' ? 'min-w-9 px-3 rounded-full' : 'w-9 rounded-full';

  return (
    <span className={`nn-badge--${variant} inline-flex h-9 items-center justify-center text-lg font-bold text-white ${shape}`}>
      {value}
    </span>
  );
}

function PlayerCard({ player, distribution, readerRating, onRate, isSubmitting }) {
  const hasVoted = readerRating != null;
  const average = averageRating(distribution);
  const total = countRatings(distribution);

  return (
    <article className="py-8">
      {/* En-tête : portrait + nom (+ note Blick tant que le lecteur n'a pas voté) */}
      <div className="flex items-center gap-4">
        {/* Repli sur default.jpg si l'URL est absente OU cassée : le portrait
            est figé à la publication, mais l'objet Storage peut avoir été
            supprimé depuis (remplacement dans l'éditeur d'équipes). */}
        <img
          src={player.img || defaultPortrait}
          alt=""
          width="72"
          height="72"
          onError={(e) => {
            if (e.currentTarget.dataset.fallback) return;
            e.currentTarget.dataset.fallback = '1';
            e.currentTarget.src = defaultPortrait;
          }}
          className="h-16 w-16 sm:h-[72px] sm:w-[72px] shrink-0 rounded-full object-cover object-top border-2 border-solid nn-stroke-brand p-0.5 nn-fill-default box-border"
        />

        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <h2 className="m-0 text-xl font-medium leading-tight border-b-2 border-solid nn-stroke-brand pb-0.5">
              {player.name}
            </h2>

            {!hasVoted && (
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold nn-text-brand">
                  Note
                </span>
                <Badge value={player.blickRating} variant="blick" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Paragraphe du journaliste — HTML produit par RichTextEditor (source de confiance) */}
      <div
        className="natinotes-comment antialiased mt-4 text-base leading-relaxed"
        dangerouslySetInnerHTML={{ __html: player.comment }}
      />

      {/* Zone interactive */}
      {!hasVoted ? (
        <div className="mt-6 text-center">
          <p className="m-0 text-xs nn-text-weak">
            Donnez une note à {player.name}&nbsp;!
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:gap-3">
            {RATINGS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={isSubmitting}
                onClick={() => onRate(value)}
                aria-label={`Donner la note ${value} à ${player.name}`}
                className="nn-rating-btn h-10 w-10 rounded-full text-lg font-bold transition hover:brightness-95 disabled:opacity-40 sm:h-14 sm:w-14 cursor-pointer"
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 text-center">
          <p className="m-0 text-xs nn-text-weak">
            {total} {total > 1 ? 'votes' : 'vote'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-6">
            {/* Même ordre que les onglets du récap : Blick · Vous · Communauté */}
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold nn-text-brand">Blick</span>
              <Badge value={player.blickRating} variant="blick" />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold nn-text-weak">Vous</span>
              <Badge value={readerRating} variant="reader" />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold nn-text-sport">Communauté</span>
              <Badge value={average ?? '—'} variant="community" />
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

export default PlayerCard;
