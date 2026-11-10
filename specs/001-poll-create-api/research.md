# Research: API de création de sondages

Décisions de Phase 0. Chaque entrée : décision, raison, alternatives écartées.

## R1. Emplacement du code partagé

- **Decision**: nouveau package `packages/widget-model` (`@rms/widget-model`), ESM pur, zéro
  dépendance. Les fonctions qui ont besoin de Firestore reçoivent ce qui leur manque en
  paramètre (`serverTimestamp`), elles n'importent pas de SDK.
- **Rationale**: `packages/services/index.js` importe `firebase.js`, qui initialise le SDK client
  et lit `import.meta.env` au chargement : un `import` depuis Node casse. Le horodatage serveur
  diffère entre SDK client (`serverTimestamp()`) et Admin SDK (`FieldValue.serverTimestamp()`) :
  l'injection est le seul point de variation.
- **Alternatives**: sous-chemin de `@rms/services` (embarque la dépendance `firebase` client dans
  l'image serveur, et le moindre import de l'index casse) ; copie dans l'API (viole le
  principe III).

## R2. Périmètre extrait (cobaye `poll`)

- **Decision**: déplacer `transformWidgetData` en entier (tous types : c'est une seule fonction,
  déjà pure hors horodatage) ; déplacer la validation et la préparation `poll` uniquement ;
  déplacer la construction de l'URL d'embed (`ListItem.jsx` `handleCopy`).
- **Rationale**: couper `transformWidgetData` par type laisserait deux copies de la même fonction
  (dashboard pour les autres types, package pour `poll`). La validation des autres types est
  entremêlée avec la mise en évidence DOM (`triggerValidationError`) ; elle migrera type par
  type une fois le pattern prouvé.
- **Alternatives**: tout extraire maintenant (risque de régression sur 11 types sans tests) ;
  extraire seulement le cas `poll` de la transformation (duplication).

## R3. Contrat de validation partagé

- **Decision**: `validatePoll({ theme, question, answers, brand })` renvoie la liste ordonnée de
  toutes les violations `{ field, code, message }`, dans l'ordre historique du dashboard
  (rubrique, question, nombre de réponses, réponse vide) puis marque. Le dashboard affiche la
  première (même UX qu'aujourd'hui) ; l'API les renvoie toutes.
  - `theme` : obligatoire, ∈ `Suisse | Inter | Sport` (casse exacte).
  - `brand` : vide → `blick` ; sinon ∈ `blick | pme`.
  - `question` : chaîne non vide après rognage.
  - `answers` : tableau d'au moins 2 éléments ; chaque `text` chaîne non vide après rognage.
- **Rationale**: relevé production du 2026-11-09 (493 sondages, lecture seule) : rubriques non
  vides ⊂ {Sport 162, Suisse 96, Inter 12}, 223 vides (anciens documents) ; marques non vides ⊂
  {blick 295, pme 4}, 194 vides ; jusqu'à 14 réponses ; question ≤ 119 caractères. Les vides
  sont déjà refusés par le dashboard à l'édition (rubrique) ou normalisés (`blick`) : l'ajout du
  contrôle d'énumération ne change rien pour les éditeurs. Aucun maximum : le dashboard n'en a
  pas et la prod contient 14 réponses.
- **Changement assumé**: la question est désormais rognée et une question faite d'espaces est
  refusée (le dashboard l'acceptait : `!formData.pollTxt`). Seul écart visible (SC-006).
- **Alternatives**: valider uniquement côté API (divergence) ; renvoyer la première erreur
  seulement (force l'appelant à itérer).

## R4. Idempotence sans champ de stockage

- **Decision**: avec `Idempotency-Key`, l'id du document est dérivé :
  `sha256(callerEmail + "\n" + key)` en hexadécimal, 20 premiers caractères. Écriture par
  `DocumentReference.create()` (échoue si l'id existe, code gRPC `ALREADY_EXISTS` = 6). Sur
  conflit : relecture, comparaison du contenu stocké avec le document qu'aurait produit la
  demande (`type`, `data.question`, textes de `data.answerTxts` dans l'ordre, `meta.brand`,
  `meta.theme`, `meta.author`). Égal → `200` + en-tête `Idempotent-Replayed: true` ; différent →
  `409 IDEMPOTENCY_CONFLICT`. Sans clé : id auto (`collection.doc()`).
- **Rationale**: atomique (pas de fenêtre entre test et écriture, deux rejeux concurrents
  convergent), aucun champ hors modèle 4 blocs, aucune collection en plus. Préfixer par
  l'appelant isole les espaces de clés (US3-3). 80 bits suffisent au volume.
- **Alternatives**: collection `idempotencyKeys` avec empreinte (deuxième écriture,
  transaction, TTL à gérer) ; stocker l'empreinte dans `meta` (viole le principe I).
- **Limite connue**: si le sondage a été modifié dans le dashboard entre la création et le
  rejeu, le rejeu renvoie `409` (documenté dans la spec, Edge Cases).

## R5. Authentification serveur à serveur

- **Decision**: `Authorization: Bearer <ID token Google>`. Vérification applicative via
  `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience })` (signature, `iss`,
  `exp`, `aud`), puis `email_verified === true` et `email` ∈ `ALLOWED_CALLERS`. Token absent,
  illisible, expiré ou mauvaise audience → `401` + `WWW-Authenticate: Bearer` ; identité valide
  hors liste → `403`. L'authentification passe avant la lecture du corps. En plus, déploiement
  Cloud Run `--no-allow-unauthenticated` avec `roles/run.invoker` pour le compte du Hub
  (défense en profondeur).
- **Rationale**: pas de secret à faire tourner ; le Hub obtient le jeton depuis le serveur de
  métadonnées de Cloud Run (`audience` = URL du service). La vérification applicative rend la
  liste blanche explicite, versionnée dans la config, et testable hors GCP.
- **Alternatives**: IAM Cloud Run seul (liste blanche invisible du code, intestable en local) ;
  clé API (écartée en clarification).

## R6. Runtime HTTP

- **Decision**: `node:http` + routeur minimal (une route `POST /polls`) ; lecture du corps
  bornée à 64 Kio (au-delà : `413` sans tout lire) ; `Content-Type` `application/json`
  (paramètre `charset` toléré) sinon `415` ; champs inconnus → `400`.
- **Rationale**: une route, zéro dépendance HTTP, démarrage à froid minimal.
- **Alternatives**: Express/Fastify (dépendance et surface sans bénéfice pour une route).

## R7. Format des erreurs

- **Decision**: RFC 9457 `application/problem+json` :
  `{ status, code, title, detail, errors? }`, `code` stable en MAJUSCULES, `errors[]` =
  `{ field, code, message }` pour les erreurs de validation. Messages en français (équipe
  éditoriale), codes en anglais (machine).
- **Rationale**: standard IETF, extensible, lisible par le Hub sans conventions maison.
- **Alternatives**: enveloppe `{ error: {...} }` maison.

## R8. Déploiement et configuration

- **Decision**: image construite par Cloud Build depuis la racine du monorepo
  (`apps/api/Dockerfile`, contexte `.`, `cloudbuild.yaml` = build + push seulement) ; déploiement
  `gcloud run deploy` lancé par la personne qui déploie, avec ses droits (le compte Cloud Build
  n'obtient aucun droit Cloud Run ni `actAs`) ; un service Cloud Run par projet
  (`blick-tools-api` dans `blick-tools-app` et dans `blick-tools-app-42a99`) ; compte de service
  `api-blicktools-ecriture@<projet>.iam.gserviceaccount.com`, rôle *Cloud Datastore User*.
  Variables obligatoires : `API_AUDIENCE`, `ALLOWED_CALLERS`, `CLIENT_BASE_URL` ; `PORT` fourni
  par Cloud Run ; projet Firestore = projet du service (ADC). Valeurs tirées au déploiement du
  `.env` de destination ; le service ne lit pas le `.env` à l'exécution.
- **Rationale**: principe IV (pas de fallback prod, compte dédié, moins de droits délégués) ;
  `npm ci -w apps/api` dans l'image n'installe que les dépendances de l'API.
- **Prérequis hors code**: facturation — les deux projets sont sur Blaze (confirmé le
  2026-11-09) ; `api-blicktools-ecriture` créé (test, 2026-11-09) ; appelant Hub :
  `hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com` (compte dédié).
