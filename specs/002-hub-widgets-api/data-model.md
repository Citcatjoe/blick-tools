# Data Model: calendriers, tinders et quiz via l'API

Champs communs à toute demande de création : `theme` (obligatoire : `Suisse` · `Inter` · `Sport`),
`brand` (facultatif, seule valeur admise `blick`, défaut `blick`), `author` (facultatif, e-mail,
défaut « Hub Rédaction »). Tout champ inconnu → `400` `unknown_field`. En-tête
`Idempotency-Key` facultatif (même format que `POST /polls`).

## 1. Calendrier — `POST /calendars`

| Champ | Type | Obligatoire | Règle | Document |
|---|---|---|---|---|
| `title` | string | oui | non vide après rognage | `data.title`, `meta.title` |
| `dates` | array | oui | ≥ 1 | `data.dates[]` |
| `dates[i].text` | string | oui | non vide | `.text` |
| `dates[i].complement` | string | non | rogné | `.complement` (`''`) |
| `dates[i].start` | string | oui | ISO 8601 date-heure ; sans décalage = Europe/Zurich | `.scheduleStart` (Timestamp) |
| `nbElemsToShow` | integer | non | 1–10 ; absent = tous | `data.nbElemsToShow` (100 = tous) |
| `linkGlobal` | object | non | `text` et `href` ensemble ; `newTab` booléen facultatif | `data.linkGlobalTxt/Href/NewTab` |

Chaque date stockée : `{ text, complement, scheduleStart, scheduleEnd: null, showBadge: false,
liveLinkExists: false, liveLinkUrl: '' }` (forme du dashboard, options avancées désactivées).
`stats` : `{ views: 0, seeAllClicks: 0 }`.

## 2. Tinder — `POST /tinders`

| Champ | Type | Obligatoire | Règle | Document |
|---|---|---|---|---|
| `label` | string | oui | non vide | `data.tinderLabel` |
| `title` | string | oui | non vide | `data.tinderTitle`, `meta.title` |
| `cards` | array | oui | 1 à 3 | `data.tinderCards[]` |
| `cards[i].label` | string | oui | non vide | `{ id, tinderCardLabel, tinderCardTitle }` |
| `cards[i].title` | string | oui | non vide | |

`data.tinderLegend = { txt: '', display: false }`. `stats` : `{ views: 0, tinderVotes: { [cardId]:
{ yes: 0, no: 0 } } }`.

## 3. Quiz — `POST /quizzes`

| Champ | Type | Obligatoire | Règle | Document |
|---|---|---|---|---|
| `title` | string | oui | non vide | `data.title`, `meta.title` |
| `questions` | array | oui | ≥ 1 | `data.questions[]` |
| `questions[i].text` | string | oui | non vide | `.text` |
| `questions[i].answers` | array | oui | exactement 4, exactement une `isCorrect: true` | `.answers[{ isCorrect, text }]` |
| `questions[i].answers[j].text` | string | oui | non vide | |
| `questions[i].hint` | string | non | rogné | `.hint` (`''`) |
| `questions[i].hidePercent` | boolean | non | | `.hidePercent` (`false`) |
| `questions[i].img` | string | non | URL https, image téléchargeable | `.img` = URL de la **copie** Storage (`''` si absente) |
| `conclusion.text1/2/3` | string | oui | non vides | `data.conclusion` |

Chaque question reçoit un `id` (UUID). `stats` : `{ views: 0, statsGlobal: { scoreDistribution:
{ 0: 0, …, n: 0 } }, statsQuestions: { [questionId]: { correct: 0, incorrect: 0 } } }`.

## 4. Réponses

- Création : `201 { id, embedUrl }` ; rejeu `200` + `Idempotent-Replayed: true`.
- `embedUrl` : `<CLIENT_BASE_URL><type>/?<type>Doc=<id>` (sans `&brand=`, réservé au sondage).
- Lecture (`GET /<ressource>/{id}`) : projection R7 de `research.md` ; `404` si absent ou d'un
  autre type.

## 5. Erreurs de champ (`errors[].field`)

`title`, `label`, `theme`, `brand`, `author`, `dates`, `dates[i].text`, `dates[i].start`,
`nbElemsToShow`, `linkGlobal`, `cards`, `cards[i].label`, `cards[i].title`, `questions`,
`questions[i].text`, `questions[i].answers`, `questions[i].answers[j].text`, `questions[i].correctAnswer`,
`questions[i].hint`, `questions[i].img`, `conclusion.text1`, `conclusion.text2`,
`conclusion.text3`. Codes : `required`, `invalid_type`, `invalid_value`, `too_few`, `too_many`,
`unknown_field`.
