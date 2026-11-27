# Intégration côté Hub Rédaction — widgets Blick Tools (sondages, calendriers, tinders, quiz, teasers, dossiers, NatiNotes, joueur·euse du match, faits marquants)

Brief autonome pour le dépôt du Hub (extension CMS). Contrat formel :
[`contracts/openapi.yaml`](./contracts/openapi.yaml) — à copier dans le dépôt du Hub si besoin.

## Environnements

| Hub | Blick Tools | URL de l'API (= audience du jeton) | Base des `embedUrl` |
|---|---|---|---|
| stage | test (`widget-studio-test`) | `https://blick-tools-api-1058200385938.europe-west6.run.app` | `https://www.prod.storytelling.blick.ch/fr/_sandbox/widget-studio-test/bl-tools-client-` |
| prod | prod (`blick-tools-app-42a99`) | `https://blick-tools-api-273916803061.europe-west1.run.app` | `https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-client-` |

L'URL de l'API est une **configuration par environnement** du Hub (ex. `BLICK_TOOLS_API_URL`),
jamais en dur. Les sondages créés depuis le stage vivent dans la base de test de Blick Tools,
visibles dans le dashboard de test : https://www.prod.storytelling.blick.ch/fr/_sandbox/widget-studio-test/backend/

## Authentification

- `Authorization: Bearer <ID token Google>` du **compte de service sous lequel tourne le backend
  du Hub**, émis pour l'audience = URL de l'API ci-dessus, **avec l'e-mail** (format `full`).
- Comptes autorisés aujourd'hui (test) : `hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com`.
  **Si le stage tourne sous un autre compte**, le communiquer à Blick Tools : il doit être ajouté
  à la liste blanche et au rôle `run.invoker` du service de test, sinon `403`.
- Sur Cloud Run, `google-auth-library` obtient le jeton auprès du serveur de métadonnées (format
  `full` par défaut) et le renouvelle seul :

```js
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(BLICK_TOOLS_API_URL); // audience = URL de base, sans /polls

const res = await client.request({
  url: `${BLICK_TOOLS_API_URL}/polls`,
  method: 'POST',
  headers: { 'Idempotency-Key': creationKey },
  data: { question, answers, theme, brand, author },
  validateStatus: () => true, // traiter soi-même 4xx/5xx (corps problem+json)
});
```

(Python : `google.oauth2.id_token.fetch_id_token(Request(), BLICK_TOOLS_API_URL)`.)

- **En local** (hors Cloud Run), un compte utilisateur ne peut pas émettre ce jeton. Options :
  tester sur le stage déployé ; ou, si un admin GCP du Hub accorde au développeur le rôle
  *Créateur de jetons du compte de service* sur `hub-backend@…`, obtenir un jeton avec
  `gcloud auth print-identity-token --impersonate-service-account=hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com --audiences=<URL API> --include-email`
  et le passer en en-tête.

## Requête `POST /polls`

```json
{
  "question": "Faut-il introduire la semaine de 4 jours en Suisse ?",
  "answers": ["Oui", "Non", "Sans opinion"],
  "theme": "Suisse",
  "brand": "blick",
  "author": "jane.doe@ringier.ch"
}
```

| Champ | Obligatoire | Règle |
|---|---|---|
| `question` | oui | non vide après rognage |
| `answers` | oui | tableau de chaînes, ≥ 2, chacune non vide après rognage, ordre d'affichage |
| `theme` | oui | rubrique : `Suisse` · `Inter` · `Sport` (casse exacte) |
| `brand` | non | `blick` (défaut) · `pme` |
| `author` | non | e-mail du journaliste (affiché comme auteur dans Blick Tools) ; défaut « Hub Rédaction » |

Tout autre champ est refusé (`400`, `unknown_field`). Corps JSON ≤ 64 Kio,
`Content-Type: application/json`.

## Réponses

- `201 { "id", "embedUrl" }` — créé. Conserver **les deux** dans le CMS ; afficher le sondage
  avec `<iframe src="{embedUrl}">`. Pour les intégrations qui refusent l'iframe brute :
  oEmbed `https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-oembed/oembed.php?url={embedUrl}`.
- `200` + `Idempotent-Replayed: true` — rejeu d'une création déjà faite : même `id`, même `embedUrl`.
- Erreurs : `application/problem+json` `{ status, code, title, detail?, errors? }`.

| Statut | `code` | Que faire |
|---|---|---|
| 400 | `VALIDATION_FAILED` | afficher `errors[].message` (français, prêts à l'emploi) par champ `errors[].field` (`question`, `answers`, `answers[i]` base 0, `theme`, `brand`, `author`) ; ne pas rejouer |
| 400 | `INVALID_JSON`, `INVALID_IDEMPOTENCY_KEY` | bug d'intégration ; ne pas rejouer |
| 401 | `UNAUTHENTICATED` | jeton absent/expiré/mauvaise audience ; renouveler le jeton, rejouer **une** fois |
| 403 | `FORBIDDEN` (ou 403 HTML de Cloud Run) | compte non autorisé : configuration, pas de rejeu |
| 409 | `IDEMPOTENCY_CONFLICT` | clé déjà utilisée pour un autre contenu : nouvelle clé = nouveau sondage |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | bug d'intégration |
| 500 / 503 / timeout réseau | `INTERNAL` / `UNAVAILABLE` | rejouer **avec la même clé**, backoff (ex. 1 s, 5 s, 15 s) |

## Idempotency-Key : la règle

Une clé = **une tentative de création**. La générer (UUID) au moment où le journaliste valide la
création, la **persister avec la demande en attente**, et la réutiliser à chaque rejeu de cette
même demande. Ne pas la dériver seulement de l'article : un deuxième sondage dans le même
article, ou une question corrigée après création, donnerait un `409`. 1–255 caractères ASCII
imprimables, sans espace.

## Lire et corriger un sondage

Même authentification, même liste blanche, mêmes erreurs `application/problem+json`.

### `GET /polls/{id}`

`200` :

```json
{
  "id": "b2dbf0282d88dc30ce5e",
  "embedUrl": "https://…/bl-tools-client-poll/?pollDoc=b2dbf0282d88dc30ce5e&brand=blick",
  "question": "Faut-il introduire la semaine de 4 jours ?",
  "answers": [
    { "id": "27de539a-…", "text": "Oui", "votes": 12 },
    { "id": "85ccf997-…", "text": "Non", "votes": 3 }
  ],
  "totalVotes": 15,
  "theme": "Suisse",
  "brand": "blick"
}
```

- `answers` dans l'ordre d'affichage ; `votes = stats.answerCounters.<answerId>` (0 si absent) ;
  `totalVotes` = somme des votes des réponses listées.
- `embedUrl` identique à celle de `POST /polls` et au lien copié depuis le dashboard.
- `404 NOT_FOUND` si l'id n'existe pas ou n'est pas un `poll`.

### `PATCH /polls/{id}`

Corps :

```json
{
  "question": "Question corrigée ?",
  "answers": [ { "id": "27de539a-…", "text": "Oui, plutôt" }, { "id": "85ccf997-…", "text": "Non" } ],
  "editor": "jane.doe@ringier.ch"
}
```

- `question` et `answers` sont optionnels ; `editor` est obligatoire (e-mail du journaliste,
  conservé dans `meta.updatedBy`, avec `meta.updatedAt`).
- `answers` : **exactement** les identifiants existants, dans le même ordre. Seul le texte
  change. Pas d'ajout, de retrait ni de réordonnancement : tout écart → `400 VALIDATION_FAILED`
  (`field` = `answers` ou `answers[i]`, base 0). Rubrique et marque se corrigent dans le dashboard.
- Les votes ne sont jamais écrits par le PATCH (aucune perte de votes possible).
- `200` : même forme que `GET` (état après modification). `404` si introuvable.
- Écriture transactionnelle (1 lecture + 1 écriture).
- Gardé pour les extensions déjà en production ; les nouvelles versions utilisent `PUT` (section
  suivante). Le `PATCH` ne change pas la `version`.

## Modifier un widget déjà placé (spec `006-hub-edit`, les 11 formats)

Même authentification, même liste blanche, mêmes erreurs. Le Hub pré-remplit son formulaire avec
la lecture, puis renvoie le formulaire modifié :

1. `GET /<ressource>/{id}` rend, en plus de la lecture habituelle :
   - `form` : la **requête de création** du widget (mêmes clés que `GET /widget-types`, mêmes
     formes : dates `YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm` heure suisse, vrais retours à la ligne,
     HTML restreint pour `richtext`, images = URL https du Storage), sans `author` ; valeurs
     facultatives vides absentes ;
   - `version` : chaîne opaque, à renvoyer telle quelle.
2. `PUT /<ressource>/{id}` avec `{ …form modifié…, version, editor }` (`editor` = e-mail du
   journaliste, facultatif → « Hub Rédaction ») → `200 { id, embedUrl, version }` (nouvelle
   version pour une modification suivante ; `id` et `embedUrl` inchangés).

```json
{
  "question": "Faut-il introduire la semaine de 4 jours ?",
  "answers": [ { "id": "85ccf997-…", "text": "Non" }, "Peut-être", { "id": "27de539a-…", "text": "Oui" } ],
  "theme": "Suisse", "brand": "blick",
  "version": "2026-11-27T10:15:30.123Z", "editor": "jane.doe@ringier.ch"
}
```

- **Éléments de liste** : garder l'`id` reçu dans `form` (réponses de sondage, dates de
  calendrier qui en ont, cartes, questions, boutons, candidats, faits marquants ; NatiNotes :
  `players[i].id` est l'id du joueur). Un élément sans `id` (ou avec un `id` inconnu) est nouveau.
  Sondage : une nouvelle réponse peut rester un simple texte.
- **Compteurs** comme dans le dashboard : votes, clics, notes et statistiques suivent l'`id` de
  leur élément (réordonner ne perd rien) ; un élément retiré perd les siens ; un nouveau part de 0.
  Vues et compteurs globaux (clics « tout voir », révélations, messages reçus…) gardés.
- **Rubrique et marque** : reprises de la requête. Auteur et date de création : gardés.
- **Images** : une nouvelle image (`POST /images` ou URL) est importée comme à la création ; une
  image renvoyée telle quelle est gardée ; l'ancienne copie remplacée n'est pas supprimée.
- **Erreurs** : `409 VERSION_CONFLICT` si le widget a été modifié entre-temps (Studio, autre
  journaliste) → recharger (`GET`) et refaire la modification ; `404` si supprimé ou introuvable ;
  `400 VALIDATION_FAILED` avec les mêmes `errors[].field` qu'à la création (plus `version`,
  `editor`, `<liste>[i].id`) ; `author` → `unknown_field`.
- NatiNotes : un joueur déjà présent reste accepté même s'il a été archivé depuis.

## Calendriers, tinders et quiz (spec `002-hub-widgets-api`)

Même authentification, liste blanche, `Idempotency-Key` (propre à l'appelant **et** au format),
limite de corps et erreurs que `POST /polls`. Création et lecture seulement : toute correction se
fait dans le dashboard (`?edit=<id>`). Marque : `blick` seulement (`pme` refusée). Rubrique
obligatoire (`Suisse` · `Inter` · `Sport`). `author` facultatif (e-mail du journaliste). Champs
détaillés : [`specs/002-hub-widgets-api/data-model.md`](../002-hub-widgets-api/data-model.md). Les
règles sont celles du dashboard (module partagé) : un widget valide dans l'un l'est dans l'autre.

| Format | Création | Lecture | Corps minimal |
|---|---|---|---|
| Calendrier | `POST /calendars` | `GET /calendars/{id}` | `{ "title", "theme", "dates": [{ "text", "start" }] }` |
| Tinder | `POST /tinders` | `GET /tinders/{id}` | `{ "label", "title", "theme", "cards": [3 × { "label", "title" }] }` (exactement 3 cartes) |
| Quiz | `POST /quizzes` | `GET /quizzes/{id}` | `{ "title", "theme", "questions": [{ "text", "answers": [4 × { "text", "isCorrect"? }] }], "conclusion": { "text1", "text2", "text3" } }` |

- **Calendrier** : `start` en ISO 8601. Avec décalage (`2026-12-20T20:45:00+01:00`, `…Z`) →
  respecté ; sans (`2026-12-20T20:45`) → heure suisse. Champs facultatifs : `complement` par date,
  `nbElemsToShow` (1–10, absent = toutes), `linkGlobal: { text, href, newTab? }` (texte et URL
  ensemble, `href` en `http(s)://`).
- **Tinder** : exactement 3 cartes (1 ou 2 → `400` `cards` / `too_few`) ; chaque carte reçoit un
  id ; votes `{ yes, no }` par carte. `legend` facultative (texte affiché sous les cartes).
- **Quiz** : exactement 4 réponses et **une** `isCorrect: true` par question ; trois conclusions
  obligatoires ; `hint` et `hidePercent` facultatifs ; `img` facultative, URL https :
  - **fichier choisi par le journaliste** : l'envoyer d'abord à `POST /images` (ci-dessous) et
    mettre l'`url` rendue dans `img` ;
  - **URL publique** : l'API télécharge l'image (≤ 10 Mo, 10 s), la convertit comme le dashboard
    et en stocke une copie chez Blick Tools ; l'URL d'origine peut disparaître ensuite.
  Image injoignable, illisible ou envoi expiré → `400` sur `questions[i].img`, rien n'est créé.
  Prévoir un délai d'appel plus long (≈ 30 s) pour un quiz avec plusieurs images à télécharger.
- **`POST /images`** : corps = **le fichier brut** (ni JSON ni multipart), `Content-Type`
  `image/jpeg`, `image/png`, `image/webp` ou `image/gif`, ≤ 10 Mo ; même authentification.
  `201 { "url" }`. Erreurs `400 VALIDATION_FAILED`, champ `image` : `invalid_type` (pas une image
  ou format refusé — le format réel est vérifié), `too_large`, `invalid_value` (illisible). Un
  envoi qu'aucun widget n'utilise est supprimé après **7 jours** ; le widget garde sa propre
  copie. Même usage pour tous les champs image (`kind: image` de `GET /widget-types`).
- **Lecture** : contenu + compteurs (`views`, `seeAllClicks` ; votes `yes`/`no` par carte ;
  `correct`/`incorrect` par question, `plays`, `scoreDistribution`). Un id d'un autre format →
  `404`.
- `embedUrl` : `…/bl-tools-client-<type>/?<type>Doc=<id>` (sans `&brand=`).

## Teasers, dossiers, NatiNotes, joueur·euse du match, faits marquants, pronostics, appels à témoignage (spec `005-hub-all-formats`)

Mêmes règles d'appel que les calendriers, tinders et quiz (création et lecture, `blick` seulement,
rubrique obligatoire, `author` facultatif, `Idempotency-Key` propre au format). Champs, libellés,
bornes et variantes : `GET /widget-types`. Détail et décisions :
[`specs/005-hub-all-formats/spec.md`](../005-hub-all-formats/spec.md).

| Format | Création | Lecture | Corps minimal |
|---|---|---|---|
| Teaser | `POST /teasers` | `GET /teasers/{id}` | `{ "label", "title", "img", "button": { "text", "href" }, "theme" }` |
| Dossier | `POST /folders` | `GET /folders/{id}` | `{ "label", "name", "img", "buttons": [1 à 4 × { "text", "href" }], "theme" }` |
| NatiNotes | `POST /natinotes` | `GET /natinotes/{id}` | `{ "title", "players": [{ "id", "blickRating", "comment" }], "theme" }` |
| Joueur·euse du match | `POST /potms` | `GET /potms/{id}` | `{ "context", "category", "text", "date", "players": [≥ 2 × { "name", "position", "team" }], "theme" }` |
| Faits marquants | `POST /facts` | `GET /facts/{id}` | `{ "title", "date", "items": [{ "type", … }], "theme" }` |
| Pronostic | `POST /pronos` | `GET /pronos/{id}` | `{ "event", "date", "team1", "team2", "theme" }` |
| Appel à témoignage | `POST /testimonies` | `GET /testimonies/{id}` | `{ "title", "subject", "question", "theme" }` (+ `timeExpires` facultatif) |

- **Images** (`img` du teaser et du dossier, `items[i].src` / `items[i].picture` des faits) :
  comme celles du quiz (`POST /images` ou URL publique), `400` sur le chemin de l'image.
- **Retours à la ligne** : `title` du teaser et `name` du dossier les gardent (`\n` réels).
- **Dates seules** (`date` du joueur·euse du match, des faits et du pronostic) : `2026-12-20`, enregistrées à midi
  heure suisse ; la lecture rend le même format.
- **NatiNotes** : joueurs choisis dans `GET /teams` (`players[i].id`), sans doublon ; un
  joueur inconnu ou archivé → `400` sur `players[i].id`. Note Blick entière de 1 à 6.
- **Joueur·euse du match** : `team` parmi les équipes du `context` (`optionsBy` de la description) ;
  `position` neutre (`Attaquant`…), accordée à l'enregistrement si la catégorie est `Dames`.
- **Faits marquants** : chaque item a un `type` (`normal`, `quote`, `picture`, `number`,
  `rating`) et seulement les champs de ce type (sinon `unknown_field`) ; au plus un `rating`.
- **Pronostic** : `event` parmi les compétitions, `team1` / `team2` parmi les équipes nationales
  (`options` de la description ; deux fois la même équipe est admis, comme dans le dashboard).
  Code et couleur de l'équipe complétés à l'enregistrement ; un vote posé sur chaque issue
  (équipe 1, équipe 2, nul), comme le dashboard. La couleur des barres se change dans le dashboard.
- **Appel à témoignage** : `timeExpires` facultatif, date et heure suisses sans décalage
  (`2026-12-20T20:45`, comme `dates[i].start` d'un calendrier) ; absent → pas de date limite.
- **Texte enrichi** (`kind: richtext` : commentaire des notes, textes des faits) : HTML restreint
  à `<p>`, `<br>`, `<strong>`, `<em>`, `<a href="http(s)…">` ; le reste est échappé ou retiré
  par l'API, comme dans le dashboard. Texte vide après nettoyage → `400`.
- **Lecture** : contenu + compteurs (teaser `views`, `clicks` ; dossier `views`, `clicks` par
  bouton ; notes `views`, `ratings` par joueur ; joueur·euse du match `views`, `votes` par joueur ;
  faits `views`, `reveal`, `ratingStats` ; pronostic `views`, `votes` `{ team1, team2, draw }` ;
  témoignage `views`, `msgSent`, `timeExpires` — jamais les messages des lecteurs, données
  personnelles exportées depuis le dashboard).

### `GET /teams`

Effectifs saisis dans le dashboard (« Éditer les effectifs ») : `{ "teams": [{ "id", "name",
"players": [{ "id", "name", "team", "img", "focal" }] }] }`, joueurs archivés exclus, équipes et
joueurs triés par nom. Le Hub s'en sert pour le champ `players[i].id` des NatiNotes
(`choice` + `source: "teams"` dans la description). Pour ajouter un joueur : dashboard
`?teams` (ou `?teams=<id de l'équipe>`), qui ouvre l'éditeur des effectifs après connexion.

## Description des formulaires (spec `004-hub-form-descriptions`)

`GET /widget-types` (même authentification) rend la description des formats ouverts à l'API :
pour chaque champ de la requête, son type de saisie, son libellé et son exemple en français, s'il
est obligatoire, ses bornes (schéma `WidgetForm` du contrat). Le Hub construit ses formulaires à
partir d'elle au lieu de recopier les règles : un champ ajouté ou une borne changée dans
`@rms/widget-model` arrive dans le Hub sans changer son code. Les règles restent celles des
`POST` : leurs erreurs `400` s'affichent sous le champ désigné par `errors[].field`.

## Portée du Hub par format

Le Hub prépare l'intégration d'un Blick Tools dans l'article Ring et assure les corrections
courantes ; le détail se fait dans le dashboard, ouvert sur le widget via `?edit=<id>`.

| Format | Création Hub | Correction Hub | Détail (dashboard) |
|---|---|---|---|
| **Sondage** (`poll`) | de bout en bout : sondage + Embeddable Ring publié + bloc inséré | complète par `PUT` (spec 006, compteurs conservés) ; `PATCH` (textes seuls) pour les anciennes extensions | suppression, options propres au dashboard |
| **Calendrier, tinder, quiz** | de bout en bout : widget + Embeddable Ring publié + bloc inséré | complète par `PUT` (spec 006) ; intégration Hub à faire | suppression, options propres au dashboard (`?edit=<id>`) |
| **Teaser, dossier, NatiNotes, joueur·euse du match, faits marquants, pronostic, témoignage** | par l'API (`POST`), comme les calendriers ; intégration Hub à faire | complète par `PUT` (spec 006) ; intégration Hub à faire | suppression, options propres au dashboard (`?edit=<id>`) |

> **Publication automatique** : pour le flux de création de sondage en 1 clic, l'Embeddable Ring
> est **publié automatiquement** (exception confirmée par le propriétaire du Hub Rédaction le
> 2026-11-10). **Extension aux calendriers, tinders et quiz décidée côté Blick Tools le
> 2026-11-26 — à faire confirmer par le propriétaire du Hub Rédaction.** Tout autre Embeddable
> reste en publication manuelle, selon la règle générale du CMS.

Le dashboard se trouve **à côté des widgets**, même racine que les `bl-tools-client-*` :

- test : `https://www.prod.storytelling.blick.ch/fr/_sandbox/widget-studio-test/backend/?edit=<id>`
- prod : `https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-backend/?edit=<id>`

## Hors périmètre de l'API

Pas de suppression de widget ; pas de modification des options que seul le dashboard propose
(options avancées des dates de calendrier, couleurs du pronostic : conservées par `PUT`) ;
pas de lecture des messages reçus par les appels à témoignage ; pas d'écriture des effectifs : tout cela se fait dans le dashboard Blick Tools. Le CMS garde la main
sur l'`id` et l'`embedUrl` qu'il a reçus à la création.

## Recette sur le stage

1. Créer un sondage depuis le Hub stage → `201`, `id` + `embedUrl` stockés, iframe affichée.
2. Ouvrir l'`embedUrl` : question et réponses correctes, un vote est compté.
3. Le sondage apparaît dans le dashboard de test, auteur = e-mail du journaliste, bonne rubrique/marque.
4. Couper/simuler un timeout et rejouer : même `id` (`200`), pas de doublon dans le dashboard.
5. Question vide, une seule réponse, rubrique hors liste → messages `400` affichés au bon endroit.
6. Supprimer les sondages de recette dans le dashboard de test.

## Côté Hub Rédaction

Dépôt : [`thomasbassery-sys/chrome-romandie-extension`](https://github.com/thomasbassery-sys/chrome-romandie-extension),
intégration sur la branche `feat/blick-tools-sondages`.

- **PR** : https://github.com/thomasbassery-sys/chrome-romandie-extension/pull/8
- **Contrat Hub ↔ outils** : `docs/services-backend.md` — `api.blickTools.createPoll` / `getPoll` / `updatePoll`
- **Relais serveur** : `backend/src/blick-tools.js` ; routes documentées dans `backend/README.md`
  (`GET/PATCH /v1/tools/blick-tools/blick-tools/polls/:id`, le relais ajoute `env` et traduit `{ …changes, editor }` en `PATCH {API}/polls/{id}`)
- **Outil extension** : `src/tools/blick-tools/README.md` — création en un clic, détection des
  Embeddables déjà présents, édition d'un sondage

Points de liaison entre les deux dépôts :

- **Appelant** : le backend Hub s'authentifie avec le compte de service
  `hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com` (audience = URL de l'API).
- **Correspondance des environnements** : Ring **stage** ↔ base de **test** Blick Tools ; Ring
  **prod** ↔ **prod** (variable `BLICK_TOOLS_API_URL_PROD` du Hub encore vide : pas branché).

**Contrat à ne pas casser sans prévenir le Hub** (l'extension s'appuie dessus) :

- la forme de l'`embedUrl` : `…/bl-tools-client-<type>/?<type>Doc=<id>&brand=…` (détection des
  Blick Tools déjà présents dans un article) ;
- l'emplacement du dashboard à côté des widgets : `backend/` en test, `bl-tools-backend/` en prod ;
- le paramètre `?edit=<id>` pour ouvrir un widget en édition ;
- les libellés de `apps/backend/src/data/widgetTypes.js` (repris dans le Hub).
