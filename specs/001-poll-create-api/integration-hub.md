# Intégration côté Hub Rédaction — widgets Blick Tools (sondages, calendriers, tinders, quiz)

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
  envoi qu'aucun quiz n'utilise est supprimé après **7 jours** ; un quiz garde sa propre copie.
- **Lecture** : contenu + compteurs (`views`, `seeAllClicks` ; votes `yes`/`no` par carte ;
  `correct`/`incorrect` par question, `plays`, `scoreDistribution`). Un id d'un autre format →
  `404`.
- `embedUrl` : `…/bl-tools-client-<type>/?<type>Doc=<id>` (sans `&brand=`).

## Portée du Hub par format

Le Hub prépare l'intégration d'un Blick Tools dans l'article Ring et assure les corrections
courantes ; le détail se fait dans le dashboard, ouvert sur le widget via `?edit=<id>`.

| Format | Création Hub | Correction Hub | Détail (dashboard) |
|---|---|---|---|
| **Sondage** (`poll`) | de bout en bout : sondage + Embeddable Ring publié + bloc inséré | limitée : question, texte des réponses (votes conservés) | rubrique, marque, ajout/retrait/réordonnancement des réponses, suppression |
| **Calendrier, tinder, quiz** | de bout en bout : widget + Embeddable Ring publié + bloc inséré | aucune (lecture seule) | tout (`?edit=<id>`) |
| **Tous les autres** (`teaser`, `folder`, `testimony`, `potm`, `prono`, `facts`, `natinotes`) | non | non | détectés dans l'article, édition dans le dashboard (`?edit=<id>`) |

> **Publication automatique** : pour le flux de création de sondage en 1 clic, l'Embeddable Ring
> est **publié automatiquement** (exception confirmée par le propriétaire du Hub Rédaction le
> 2026-11-10). **Extension aux calendriers, tinders et quiz décidée côté Blick Tools le
> 2026-11-26 — à faire confirmer par le propriétaire du Hub Rédaction.** Tout autre Embeddable
> reste en publication manuelle, selon la règle générale du CMS.

Le dashboard se trouve **à côté des widgets**, même racine que les `bl-tools-client-*` :

- test : `https://www.prod.storytelling.blick.ch/fr/_sandbox/widget-studio-test/backend/?edit=<id>`
- prod : `https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-backend/?edit=<id>`

## Hors périmètre de l'API

Pas de suppression de widget ; pas de correction des calendriers, tinders et quiz ; ni lecture ni
édition des autres formats : tout cela se fait dans le dashboard Blick Tools. Le CMS garde la main
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
