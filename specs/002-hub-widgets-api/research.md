# Research: calendriers, tinders et quiz via l'API

## R1. Routes typées

- **Decision**: `POST /calendars`, `GET /calendars/{id}`, `POST /tinders`, `GET /tinders/{id}`,
  `POST /quizzes`, `GET /quizzes/{id}`. Pas de `PATCH` (clarification Q1).
- **Rationale**: même forme que `/polls` déjà intégrée par le Hub ; un schéma OpenAPI par format ;
  un `GET` typé renvoie `404` si l'id est d'un autre format.
- **Alternatives**: `POST /widgets { type, … }` (un seul schéma polymorphe, validation et
  documentation plus confuses pour l'intégrateur).

## R2. Idempotence

- **Decision**: même en-tête `Idempotency-Key`. Id dérivé `sha256(caller + "\n" + type + "\n" + key)`
  hex[0..20] pour les nouveaux formats (la formule des sondages reste inchangée, sans le type, pour
  ne pas casser les rejeux en cours). Pour un quiz avec images, l'existence de l'id est vérifiée
  **avant** de télécharger les images : un rejeu ne copie aucune image.
- **Comparaison au rejeu**: contenu canonique hors ids générés, horodatages et URL d'images
  (l'URL d'origine n'est pas stockée ; seule la présence d'une image par question est comparée).

## R3. Fabrique partagée et écart du dashboard (quiz)

- **Constat**: à la création, `QuizForm.jsx` initialise la première question **sans id** et
  `statsQuestions` en **tableau par position** ; la transaction d'édition convertit ensuite en
  objet par id. Prod : 24 quiz en objet, 1 encore en tableau.
- **Decision**: `buildQuizSaveData` produit toujours la forme canonique : id par question,
  `statsQuestions = { [questionId]: { correct: 0, incorrect: 0 } }`,
  `statsGlobal.scoreDistribution = { 0: 0, …, n: 0 }`. `QuizForm.jsx` donne un id à la première
  question dès la création. La transaction d'édition du dashboard est inchangée (elle gère déjà
  objet et tableau). L'app `quiz` lit déjà les deux formes (`packages/services/api.js`).
- **Rationale**: principe II (compteurs par id) ; API et dashboard produisent le même document.

## R4. Validation partagée (ordre des erreurs = ordre du dashboard)

- **Calendar**: `theme` → `title` (ex-`calName`, « Wording du calendrier ») → `dates` (≥ 1) →
  `dates[i].text` → `dates[i].start` → `linkGlobal` (texte et URL ensemble) → `brand`. Options
  avancées (fin, badge, live) hors validation partagée (masquées, `SHOW_ADVANCED_DATE_OPTIONS =
  false`) et hors API.
- **Tinder**: `theme` → `label` → `title` → `cards` (1 à 3) → `cards[i].label` → `cards[i].title` →
  `legend` (si fournie et affichée, texte requis ; l'API ne l'accepte pas) → `brand`.
- **Quiz**: `theme` → `title` → `questions` (≥ 1) → `questions[i].text` →
  `questions[i].answers` (exactement 4) → `questions[i].answers[j].text` →
  `questions[i].answers` correcte (exactement 1) → `conclusion.text1/2/3` → `brand`.
- `brand` : seule `blick` est admise pour ces formats (`pme` désactivée dans les trois formulaires).
- Textes rognés par le builder (le dashboard ne rognait pas libellés de date ni de carte : écart
  mineur, comme pour la question du sondage).

## R5. Dates du calendrier

- **Decision**: l'API parse `start` en ISO 8601 date-heure : avec `Z`/décalage → instant exact ;
  sans décalage → heure murale `Europe/Zurich` (calcul du décalage via `Intl.DateTimeFormat`,
  heure d'été gérée ; heure inexistante au passage à l'heure d'été → refus). Date seule ou
  illisible → `400` `dates[i].start`. Le builder partagé reçoit des `Date` JS et un
  `toTimestamp` injecté (`Timestamp.fromDate` client ou Admin), comme `serverTimestamp`.
- `nbElemsToShow` : entier 1–10, ou absent = tous (100), comme le menu du dashboard.

## R6. Images de quiz (clarification Q2)

- **Téléchargement** (`images.js`) : URL `https:` uniquement, port 443 ; hôte résolu, refus des
  adresses privées, de bouclage, link-local (dont `169.254.169.254`, serveur de métadonnées) et
  IP littérales ; redirections suivies à la main (≤ 3), chacune revalidée ; délai 10 s ; ≤ 10 Mo ;
  le contenu doit être décodable comme image par `sharp`.
- **Conversion** : `sharp` → rotation EXIF, redimensionnement « inside » ≤ 1928 px sans
  agrandissement, WebP qualité décroissante (0,92 → 0,4) jusqu'à ≤ 75 Ko (même cible que
  `browser-image-compression` dans `ImageUploader.jsx`).
- **Stockage** (`imageStore.js`) : `quizs/<Date.now()>_<uuid>.webp`, métadonnée
  `firebaseStorageDownloadTokens = <uuid>` ; URL
  `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<chemin encodé>?alt=media&token=<uuid>`
  (même forme que `getDownloadURL`). Les règles Storage ne s'appliquent pas au SDK Admin.
- **Atomicité** : images traitées avant l'écriture Firestore ; si l'écriture échoue, les images
  copiées sont supprimées.
- **IAM** : `roles/storage.objectAdmin` sur le **bucket** de l'environnement pour
  `api-blicktools-ecriture` (création, métadonnée, suppression en cas d'échec). Variable
  `STORAGE_BUCKET` obligatoire (valeur = `VITE_FIREBASE_STORAGE_BUCKET` du `.env` de destination).
- **Alternatives**: référencer l'URL d'origine (dépendance à l'hébergeur), recevoir le fichier
  (limite de corps), pas d'image (quiz incomplet) — écartées en clarification.

## R7. Lecture

Projection propre à chaque format, sans exposer la structure Firestore :
- calendrier : `title`, `dates[{ text, complement, start (ISO UTC) }]`, `nbElemsToShow`,
  `linkGlobal | null`, `views`, `seeAllClicks` ;
- tinder : `label`, `title`, `cards[{ id, label, title, yes, no }]`, `views` ;
- quiz : `title`, `questions[{ id, text, hint, img, hidePercent, answers[{ text, isCorrect }],
  correct, incorrect }]`, `conclusion`, `plays` (somme de `scoreDistribution`),
  `scoreDistribution`, `views`.
Tous : `id`, `embedUrl`, `theme`, `brand`.
