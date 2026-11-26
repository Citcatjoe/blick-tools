# Feature Specification: Création de calendriers, tinders et quiz depuis le Hub Rédaction

**Feature Branch**: `002-hub-widgets-api`

**Created**: 2026-11-26

**Status**: Implemented — test recetté, prod déployée (recette par le Hub)

**Input**: User description: "J'aimerais intégrer la possibilité, depuis l'extension, d'intégrer des
calendriers, tinder et quiz. Il faut étendre l'API pour permettre ceci en prod comme en test."

Contexte : l'API serveur à serveur de la spec `001-poll-create-api` permet déjà au Hub Rédaction
(backend `hub-backend`, extension Chrome Sidekick) de créer, lire et corriger des **sondages**. Cette
fonctionnalité étend le même service aux types `calendar`, `tinder` et `quiz`, avec la même
authentification, les mêmes conventions d'erreurs et la même garantie : un widget créé par l'API est
identique à celui que produit le dashboard pour les mêmes saisies.

## Clarifications

### Session 2026-11-26

- Q: Pour les calendriers, tinders et quiz, le Hub doit-il seulement les créer, ou aussi les lire et corriger comme les sondages ? → A: Création + lecture (POST + GET par format) ; aucune correction par l'API, les corrections se font dans le dashboard (`?edit=<id>`).
- Q: Comment l'image d'une question de quiz arrive-t-elle dans Blick Tools quand le quiz est créé depuis le Hub ? → A: Le Hub envoie une URL https ; l'API télécharge l'image et la copie dans le Firebase Storage de l'environnement, avec le même traitement que le dashboard. Image facultative.
- Q: Quand le Hub envoie la date et l'heure d'un élément de calendrier, dans quel fuseau horaire l'API doit-elle la comprendre ? → A: Date-heure ISO 8601 ; avec décalage, respectée telle quelle ; sans décalage, interprétée en heure suisse (Europe/Zurich, heure d'été gérée).
- Q: Pour un calendrier, un tinder ou un quiz créé depuis le Hub, l'Embeddable Ring doit-il être publié automatiquement comme pour le sondage ? → A: Oui, flux 1 clic pour les trois formats (Embeddable créé et publié automatiquement) ; extension de l'exception du 2026-11-10 à faire confirmer par le propriétaire du Hub Rédaction.
- Q: Les trois textes de conclusion d'un quiz doivent-ils être obligatoires quand le quiz est créé depuis le Hub ? → A: Oui, obligatoires comme dans le dashboard (même règle partagée) ; absents ou vides → refus (`conclusion.text1`/`text2`/`text3`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Créer un calendrier depuis le Hub (Priority: P1)

Un journaliste prépare un article (programme d'une compétition, échéances électorales…) et saisit
dans le Hub un titre de calendrier et une liste de dates (libellé, complément facultatif, date et
heure). Le Hub crée le calendrier dans Blick Tools et reçoit son identifiant et son URL d'embed,
qu'il intègre à l'article.

**Why this priority**: le calendrier est le format le plus simple (pas d'image, pas de compteur
par élément) ; il prouve l'extension du contrat à un deuxième type.

**Independent Test**: envoyer une demande valide ; ouvrir l'URL d'embed : les dates s'affichent
dans l'ordre, à la bonne heure ; le calendrier apparaît dans le dashboard, éditable sans erreur.

**Acceptance Scenarios**:

1. **Given** un appelant autorisé, **When** il envoie un titre, une rubrique et au moins une date
   valide, **Then** un calendrier est créé et la réponse contient son identifiant et son URL d'embed.
2. **Given** une date sans libellé ou sans date de début, **When** la demande arrive, **Then** elle
   est refusée avec le champ fautif (`dates[i]`).
3. **Given** un lien global (texte + URL), **When** un seul des deux est fourni, **Then** la demande
   est refusée.
4. **Given** un calendrier créé par l'API, **When** il est ouvert dans le dashboard, **Then** les
   dates et heures affichées sont celles envoyées.

---

### User Story 2 - Créer un tinder depuis le Hub (Priority: P1)

Le journaliste saisit un label, un titre et 1 à 3 cartes (label + titre). Le Hub crée le tinder et
l'intègre. Les lecteurs swipent oui/non ; les votes sont comptés par carte.

**Why this priority**: format court, sans image, réutilise le schéma de compteurs par id déjà
éprouvé sur les sondages.

**Independent Test**: créer un tinder à 3 cartes ; voter sur une carte dans l'iframe ; le vote est
compté sur l'id de cette carte ; le tinder est éditable dans le dashboard.

**Acceptance Scenarios**:

1. **Given** 1 à 3 cartes complètes, **When** la demande arrive, **Then** le tinder est créé, chaque
   carte reçoit un identifiant unique et un compteur `{ yes: 0, no: 0 }`.
2. **Given** 0 ou plus de 3 cartes, ou une carte sans label/titre, **When** la demande arrive,
   **Then** elle est refusée avec le champ fautif.

---

### User Story 3 - Créer un quiz depuis le Hub (Priority: P2)

Le journaliste saisit un titre, une ou plusieurs questions (texte, 4 réponses dont exactement une
correcte, indice facultatif, URL d'une image facultative, copiée par Blick Tools dans son propre
stockage) et trois textes de
conclusion selon le score. Le Hub crée le quiz et l'intègre.

**Why this priority**: format le plus riche (images, statistiques par question et distribution des
scores) ; il dépend des décisions sur les images.

**Independent Test**: créer un quiz à 2 questions ; le jouer dans l'iframe ; la distribution des
scores et les statistiques par question sont comptées ; le quiz est éditable dans le dashboard.

**Acceptance Scenarios**:

1. **Given** des questions complètes (4 réponses non vides, exactement une correcte) et les trois
   conclusions, **When** la demande arrive, **Then** le quiz est créé ; chaque question reçoit un
   identifiant ; `stats.scoreDistribution` a une entrée à 0 par score possible (0 à n) et
   `stats.statsQuestions` une entrée `{ correct: 0, incorrect: 0 }` par id de question.
2. **Given** une question avec 0 ou 2 réponses correctes, ou moins/plus de 4 réponses, **When** la
   demande arrive, **Then** elle est refusée avec le champ fautif (`questions[i]…`).

---

### User Story 4 - Lire un calendrier, un tinder ou un quiz (Priority: P2)

Le Hub détecte déjà les Blick Tools présents dans un article (par l'URL d'embed). Il peut lire le
contenu d'un calendrier, tinder ou quiz pour l'afficher au journaliste, avec ses compteurs.

**Why this priority**: le Hub affiche le contenu et les compteurs d'un widget détecté ; toute
correction passe par le dashboard (`?edit=<id>`), pas par l'API (clarification 2026-11-26).

**Independent Test**: lire un widget existant de chaque type ; le contenu et les compteurs
correspondent au document.

**Acceptance Scenarios**:

1. **Given** un id de calendrier/tinder/quiz existant, **When** le Hub le lit sur la route de ce
   type, **Then** il reçoit son contenu et son URL d'embed.
2. **Given** un id d'un autre type ou inexistant, **When** le Hub le lit, **Then** la réponse est
   « introuvable ».

---

### User Story 5 - Le dashboard applique les mêmes règles (Priority: P1)

La validation et la construction des calendriers, tinders et quiz sortent du dashboard vers le
module partagé, comme pour les sondages. Les éditeurs ne voient aucun changement.

**Why this priority**: c'est la garantie « mêmes documents » (constitution, principe III).

**Independent Test**: créer et éditer un widget de chaque type dans le dashboard avant/après
l'extraction ; les documents produits sont identiques ; les messages d'erreur surlignent les mêmes
champs.

**Acceptance Scenarios**:

1. **Given** le dashboard, **When** un éditeur enregistre un calendrier, tinder ou quiz invalide,
   **Then** le même champ qu'avant est surligné.
2. **Given** les mêmes saisies, **When** le dashboard et l'API créent un widget du même type,
   **Then** les documents sont identiques hors auteur, horodatages et identifiants générés.

### Edge Cases

- Calendrier de plus de 25 dates (la production en compte jusqu'à 25) : accepté, dans la limite de
  taille du corps.
- Date sans indication de fuseau horaire (`2026-12-01T20:00`) : interprétée en heure suisse
  (Europe/Zurich, heure d'été gérée) ; avec décalage (`…+01:00`, `…Z`), respectée telle quelle.
  Date illisible ou sans heure : refusée (champ `dates[i].start`).
- Quiz à 22 questions (maximum observé en production) : accepté.
- Image de quiz injoignable, non https, pas une image ou trop lourde à télécharger : la demande
  est refusée (champ `questions[i].img`), aucun quiz ni aucune image n'est créé.
- Création refusée après la copie d'une image (autre erreur) : l'image copiée est supprimée.
- Marque `pme` : refusée pour ces trois formats (désactivée dans le dashboard).
- Rejeu avec la même clé d'idempotence : même widget, aucun doublon (comme `POST /polls`) ; la clé
  est propre à l'appelant **et** au type.
- Lecture d'un id existant d'un autre type sur une route typée : « introuvable ».

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST permettre de créer un calendrier : titre, rubrique, marque (`blick`),
  au moins une date (libellé, complément facultatif, date-heure de début ISO 8601 : décalage
  respecté s'il est fourni, sinon heure suisse Europe/Zurich), nombre d'éléments affichés (défaut :
  tous), lien global facultatif (texte + URL ensemble, ouverture dans un nouvel onglet facultative).
- **FR-002**: Le système MUST permettre de créer un tinder : label, titre, rubrique, marque
  (`blick`), 1 à 3 cartes (label + titre), chacune avec un identifiant unique et un compteur de
  votes oui/non à zéro.
- **FR-003**: Le système MUST permettre de créer un quiz : titre, rubrique, marque (`blick`), au
  moins une question (texte, exactement 4 réponses non vides dont exactement une correcte, indice
  facultatif, masquage des pourcentages facultatif, image selon FR-010), trois textes de conclusion
  **obligatoires** et non vides (score 0–33 %, 34–66 %, 67–100 %), comme dans le dashboard.
- **FR-004**: Le système MUST appliquer pour chaque format les mêmes règles de validation que le
  dashboard, et renvoyer toutes les violations en une seule réponse (champ, code, message).
- **FR-005**: Le système MUST produire, pour chaque format, un document au modèle 4 blocs identique
  à celui du dashboard pour les mêmes saisies, avec compteurs initialisés et mappés par identifiant
  d'élément.
- **FR-006**: Le système MUST renvoyer l'identifiant et l'URL d'embed du widget créé, de même forme
  que celle du dashboard (`…/bl-tools-client-<type>/?<type>Doc=<id>`).
- **FR-007**: Le système MUST réutiliser l'authentification, la liste blanche, l'idempotence, les
  limites de corps et le format d'erreurs de `POST /polls`.
- **FR-008**: Le dashboard MUST utiliser la même validation et la même construction que l'API pour
  ces trois formats.
- **FR-009**: La fonctionnalité MUST être disponible en test (`widget-studio-test`) et en production
  (`blick-tools-app-42a99`).
- **FR-010**: L'image d'une question de quiz MUST être facultative et fournie par une URL https.
  Le système MUST télécharger l'image et en stocker une copie dans le stockage d'images de
  l'environnement, avec le même traitement que le dashboard (WebP, ≤ 1928 px, ≈ 75 Ko), et
  enregistrer l'URL de cette copie dans le quiz. L'URL d'origine n'est jamais référencée.
- **FR-011**: Les options avancées des dates de calendrier masquées dans le dashboard (date de fin,
  badge, lien vers un live) ne sont pas exposées par l'API.
- **FR-012**: Le système MUST permettre de lire un calendrier, un tinder ou un quiz par son
  identifiant (contenu, compteurs, URL d'embed), sur la route de son format ; un id inexistant ou
  d'un autre format est « introuvable ». Le système MUST NOT offrir de correction de ces formats :
  elles se font dans le dashboard.

### Key Entities

- **Calendrier** : titre (`data.title`), dates ordonnées (`data.dates[]` : libellé, complément,
  début), nombre d'éléments affichés, lien global ; compteurs `views`, `seeAllClicks`.
- **Tinder** : label, titre, cartes ordonnées avec id ; compteurs `views`, `tinderVotes[cardId]`.
- **Quiz** : titre, questions ordonnées avec id (texte, réponses, indice, image), conclusions ;
  compteurs `views`, `statsGlobal.scoreDistribution`, `statsQuestions[questionId]`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un widget de chacun des trois formats créé par l'API s'affiche, enregistre une
  interaction de lecteur et apparaît dans le dashboard, sans intervention manuelle.
- **SC-002**: Pour les mêmes saisies, documents API et dashboard identiques hors auteur,
  horodatages et identifiants générés (vérifié pour chaque format).
- **SC-003**: Aucun changement visible pour les éditeurs du dashboard sur ces trois formats.
- **SC-004**: Disponible en test puis en production, recette réelle validée dans chaque
  environnement.

## Assumptions

- Le Hub (extension + `hub-backend`) développe ses propres écrans de saisie ; cette spec ne couvre
  que l'API et le module partagé.
- Côté Hub, le flux est en 1 clic pour les trois formats (widget créé, Embeddable Ring créé et
  publié automatiquement, bloc inséré), comme pour le sondage. **Dépendance** : l'extension de
  l'exception de publication automatique (actée le 2026-11-10 pour le seul sondage) doit être
  confirmée par le propriétaire du Hub Rédaction et notée dans `integration-hub.md`.
- Routes typées sur le modèle de `/polls` (une ressource par format) : contrat et validation
  propres à chaque format, cohérents avec l'existant.
- Rubriques admises : `Suisse`, `Inter`, `Sport` (comme le dashboard). Marque : `blick` seulement
  (`pme` désactivée dans les trois formulaires du dashboard).
- Relevé production du 2026-11-26 (lecture seule) : 9 calendriers actifs (2 à 25 dates, complément
  utilisé dans 5), 4 tinders actifs (toujours 3 cartes, légende jamais affichée), 25 quiz actifs (1
  à 22 questions, **image présente dans 25/25**, une seule bonne réponse partout).
- La légende du tinder (jamais affichée en production) n'est pas exposée ; elle est créée masquée.
- Hors périmètre : teaser, folder, testimony, potm, prono, facts, natinotes ; suppression.
