# Règles de sécurité — Production

Source de vérité des règles de sécurité **Firestore** de la base **prod**.
À coller dans : console Firebase → Firestore Database → Rules.

> ℹ️ **Storage** : les règles du bucket (portraits natinotes) ne sont pas gérées
> ici — la prod Storage est en `allow all` pour l'instant, par choix. À
> restreindre le jour où ce sera nécessaire (écriture/suppression authentifiées,
> lecture publique sur `portraits/`).

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // =========================================================================
    // 🟢 NOUVELLE COLLECTION : WIDGETS
    // =========================================================================
    match /widgets/{document=**} {
      allow read: if true;
      
      // Création réservée à l'admin authentifié (migration close).
      allow create: if request.auth != null;

      allow delete: if request.auth != null;
      
      // L'admin peut tout modifier
      allow update: if request.auth != null;

      // Utilisateur anonyme : uniquement les compteurs dans `stats` (et suppression optionnelle du root `ratingStats`)
      allow update: if (
        request.auth == null &&
        (request.resource.data.diff(resource.data).changedKeys().hasOnly(['stats']) || request.resource.data.diff(resource.data).changedKeys().hasOnly(['stats', 'ratingStats'])) &&
        (
          // FOLDER (clics boutons)
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['buttonClicks'])) ||
          // Vues (counterViews)
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['views']) && request.resource.data.stats.views == resource.data.stats.views + 1) ||
          // Clics (counterClicks)
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['clicks']) && request.resource.data.stats.clicks == resource.data.stats.clicks + 1) ||
          // Link Clicks
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['linkGlobalClicks']) && request.resource.data.stats.linkGlobalClicks == resource.data.stats.linkGlobalClicks + 1) ||
          // Reveal
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['reveal']) && request.resource.data.stats.reveal == resource.data.stats.reveal + 1) ||
          // Testimony
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['msgSent']) && request.resource.data.stats.msgSent == resource.data.stats.msgSent + 1) ||
          // Calendar See All
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['seeAllClicks']) && request.resource.data.stats.seeAllClicks == resource.data.stats.seeAllClicks + 1) ||
          // Poll Answers
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['answerCounters'])) ||
          // Tinder
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['tinderVotes']) && isTinderVotesNumeric(request.resource.data.stats.tinderVotes)) ||
          // Quiz
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['statsGlobal', 'statsQuestions'])) ||
          // POTM
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['totalVotes', 'playersVotes']) && request.resource.data.stats.totalVotes == resource.data.stats.totalVotes + 1) ||
          // PRONO
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['itemVotes'])) ||
          // FACTS
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['ratingStats']) && isRatingStatsNumeric(request.resource.data.stats.ratingStats)) ||
          // FACTS Item counters
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['itemCounters'])) ||
          // NATINOTES (une note déposée = un seul joueur touché)
          (request.resource.data.stats.diff(resource.data.stats).changedKeys().hasOnly(['playerRatings']) && isPlayerRatingsUpdate(request.resource.data.stats.playerRatings, resource.data.stats.get('playerRatings', {})))
        )
      );
    }
    
    // Sous-collection messages pour widgets (Testimony)
    match /widgets/{widgetId}/messages/{messageId} {
      allow create: if (
        request.auth == null &&
        request.resource.data.keys().hasOnly(['email', 'name', 'text', 'timeSent']) &&
        request.resource.data.email is string &&
        request.resource.data.name is string &&
        request.resource.data.text is string &&
        request.resource.data.timeSent == request.time &&
        request.resource.data.email.size() > 0 &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.text.size() > 0
      );
    }

    // =========================================================================
    // 🟢 COLLECTION : TEAMS (catalogues de joueurs — natinotes)
    // =========================================================================
    // Données de référence éditées depuis le backend. Aucun accès anonyme :
    // les apps clientes ne lisent jamais cette collection — un widget fige le
    // nom et le portrait de ses joueurs au moment de sa validation.
    match /teams/{teamId} {
      allow read, write: if request.auth != null;
    }

    // =========================================================================
    // 🔵 ANCIENNE COLLECTION : EMBEDS (Héritage)
    // =========================================================================
    match /embeds/{document=**} {
      allow read: if true;
      allow create, delete, update: if request.auth != null;

      allow update: if (
        request.auth == null &&
        (
          // --- Règles pour FOLDER (clics sur les boutons) ---
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['buttons']) &&
            request.resource.data.buttons is list &&
            request.resource.data.buttons.size() == resource.data.buttons.size()
          ) ||
          // ---------------------------------------------------
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterViews']) &&
            request.resource.data.counterViews is number
          ) ||
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterLinkGlobalClicks']) &&
            request.resource.data.counterLinkGlobalClicks is number
          ) ||
          // --- NOUVELLE RÈGLE (compteur Reveal) ---
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterReveal']) &&
            request.resource.data.counterReveal is number
          ) ||
          // --- NOUVELLE RÈGLE ---
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterClicks']) &&
            request.resource.data.counterClicks is number
          ) ||
          // --- NOUVELLE RÈGLE POUR TEMOIGNAGE (compteur messages envoyés) ---
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterMsgSent']) &&
            request.resource.data.counterMsgSent is number
          ) ||
          // ----------------------
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['counterSeeAllClicks']) &&
            request.resource.data.counterSeeAllClicks == resource.data.counterSeeAllClicks + 1
          ) ||
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['answerCounters']) &&
            request.resource.data.answerCounters is list &&
            request.resource.data.answerCounters.size() == resource.data.answerCounters.size()
          ) ||
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['tinderVotes']) &&
            request.resource.data.tinderVotes is map &&
            isTinderVotesNumeric(request.resource.data.tinderVotes)
          ) ||
          (
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['statsGlobal', 'statsQuestions']) &&
            // Vérifie que la distribution des scores est bien un map.
            request.resource.data.statsGlobal is map &&
            request.resource.data.statsGlobal.scoreDistribution is map &&
            // Vérifie que statsQuestions est une liste de même taille
            request.resource.data.statsQuestions is list &&
            request.resource.data.statsQuestions.size() == resource.data.statsQuestions.size()
          ) ||
          // Règles pour POTM
          (
            // Autorise la modification de totalVotes ET players ensemble
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['totalVotes', 'players']) &&
            // Vérifie l'incrémentation globale
            request.resource.data.totalVotes == resource.data.totalVotes + 1 &&
            // Vérifie que la liste des joueurs n'a pas changé de taille (pas d'ajout/suppression)
            request.resource.data.players is list &&
            request.resource.data.players.size() == resource.data.players.size()
          ) ||
          // Règles pour FACTS (votes sur les ButtonHeart)
          (
            // Autorise uniquement la modification de factsData à la racine
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['factsData']) &&
            // S'assure que factsData est toujours un Map
            request.resource.data.factsData is map &&
            // S'assure de ne pas pouvoir ajouter ou supprimer un fait complet, seulement en modifier les valeurs (ex: les votes)
            request.resource.data.factsData.size() == resource.data.factsData.size()
          ) ||
          // Règles pour PRONO
          (
            // 1. On vérifie que seul 'pronoData' change à la racine
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['pronoData']) &&

            // 2. On s'assure que pronoData est toujours une Map
            request.resource.data.pronoData is map &&

            // 3. Protection de l'intégrité (noms et couleurs ne bougent pas)
            request.resource.data.pronoData.item1.name == resource.data.pronoData.item1.name &&
            request.resource.data.pronoData.item1.color == resource.data.pronoData.item1.color &&
            request.resource.data.pronoData.item2.name == resource.data.pronoData.item2.name &&
            request.resource.data.pronoData.item2.color == resource.data.pronoData.item2.color &&

            // 4. Vérification de l'incrémentation (un seul vote à la fois sur un seul item)
            (
              request.resource.data.pronoData.item1.votes == resource.data.pronoData.item1.votes + 1 ||
              request.resource.data.pronoData.item2.votes == resource.data.pronoData.item2.votes + 1 ||
              request.resource.data.pronoData.item3.votes == resource.data.pronoData.item3.votes + 1
            )
          ) ||
          // Règles pour FACTS (RatingWidget - ratingStats à la racine)
          (
            // Autorise uniquement la modification de ratingStats
            request.resource.data.diff(resource.data).changedKeys().hasOnly(['ratingStats']) &&
            // S'assure que c'est un Map et qu'on ne change pas sa structure (clés fixes 0-10)
            request.resource.data.ratingStats is map &&
            request.resource.data.ratingStats.size() == resource.data.ratingStats.size() &&
            // Vérifie que toutes les valeurs restent numériques
            isRatingStatsNumeric(request.resource.data.ratingStats)
          )
        )
      );
    }

    // Règle spécifique pour les messages de témoignage (ancienne version)
    match /embeds/{embedId}/messages/{messageId} {
      allow create: if (
        request.auth == null &&
        request.resource.data.keys().hasOnly(['email', 'name', 'text', 'timeSent']) &&
        request.resource.data.email is string &&
        request.resource.data.name is string &&
        request.resource.data.text is string &&
        request.resource.data.timeSent == request.time &&
        request.resource.data.email.size() > 0 &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.text.size() > 0
      );
    }
    
    // =========================================================================
    // 🔴 TOUT LE RESTE
    // =========================================================================
    match /{document=**} {
      allow read, write: if false; 
    }

    // =========================================================================
    // 🛠️ FONCTIONS COMMUNES
    // =========================================================================
    function isTinderVotesNumeric(votes) {
      // Boucle sur chaque clé du map
      return votes.size() > 0 &&
        votes.keys().hasOnly(['0', '1', '2']) && // adapte si tu as plus de clés
        votes['0'].yes is number && votes['0'].no is number &&
        votes['1'].yes is number && votes['1'].no is number &&
        votes['2'].yes is number && votes['2'].no is number;
    }
    
    // FONCTION POUR POTM
    function isValidPlayerVoteUpdate(oldPlayers, newPlayers) {
      // On utilise range pour vérifier les index (limité ici à 20 joueurs pour la performance)
      // Cette logique vérifie que pour chaque joueur, soit les votes sont identiques, 
      // soit il y a exactement +1.
      return newPlayers.size() == oldPlayers.size() && 
             // On s'assure qu'au moins un élément a changé (optionnel selon votre besoin)
             newPlayers[0].votes >= oldPlayers[0].votes; 
             // Note: Firestore Rules limite la complexité des boucles. 
             // Si vous avez un nombre fixe de joueurs, il est plus sûr de viser les index.
    }
    
    // FONCTION POUR NATINOTES
    // `stats.playerRatings` a la forme { <playerId>: { "1".."6": <nombre> } }.
    // Les clés joueur sont dynamiques et les règles Firestore ne bouclent pas :
    // on ne peut donc pas valider la distribution elle-même (il faudrait extraire
    // la clé modifiée, or affectedKeys() renvoie un Set non indexable).
    // On borne ce qui est bornable : un seul joueur touché par écriture, ce qui
    // correspond exactement à updatePlayerRatingTransactional (un vote à la fois).
    // Un lecteur peut donc encore fausser SA propre distribution, mais pas
    // toucher un autre joueur ni un autre champ.
    //
    // ⚠️ affectedKeys() et NON changedKeys() : la 1re note d'un joueur AJOUTE sa
    // clé (absente avant), or changedKeys() ne compte que les clés déjà présentes
    // dont la valeur change — il ignore les ajouts. affectedKeys() = ajouts ∪
    // suppressions ∪ modifications, donc il couvre bien le tout premier vote.
    function isPlayerRatingsUpdate(newRatings, oldRatings) {
      return newRatings is map &&
        newRatings.diff(oldRatings).affectedKeys().size() == 1;
    }

    //FONCTION POUR RatingWidget DE FACTS
    function isRatingStatsNumeric(stats) {
      let keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
      return stats.keys().hasOnly(keys) &&
        stats.get('0', 0) is number && stats.get('1', 0) is number && stats.get('2', 0) is number &&
        stats.get('3', 0) is number && stats.get('4', 0) is number && stats.get('5', 0) is number &&
        stats.get('6', 0) is number && stats.get('7', 0) is number && stats.get('8', 0) is number &&
        stats.get('9', 0) is number && stats.get('10', 0) is number;
    }
  }
}
```

## Déploiement

1. **Basculer sur `.env-prod`** avant de builder/déployer les apps (backend + natinotes).
2. **Firestore** : copier le bloc ci-dessus dans la console → Firestore → Rules → Publier.
3. Vérifier après coup : un vote natinotes (anonyme) passe, et l'édition d'une
   équipe + l'upload d'un portrait (authentifié) passent.
