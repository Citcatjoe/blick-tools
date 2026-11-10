# Data Model: API de création de sondages

## 1. Demande de création (`CreatePollRequest`, corps JSON)

| Champ | Type | Obligatoire | Règle | Devient |
|---|---|---|---|---|
| `question` | string | oui | non vide après rognage | `data.question` (rognée) |
| `answers` | string[] | oui | ≥ 2 éléments, chacun non vide après rognage | `data.answerTxts[]` (`{ id, text }`) |
| `theme` | `"Suisse" \| "Inter" \| "Sport"` | oui | casse exacte (rubrique) | `meta.theme` |
| `brand` | `"blick" \| "pme"` | non | défaut `blick` | `meta.brand` |
| `author` | string (e-mail) | non | `^[^\s@]+@[^\s@]+\.[^\s@]+$`, ≤ 254 car. | `meta.author` (défaut `Hub Rédaction`) |

Tout autre champ → `400 VALIDATION_FAILED` (`code: unknown_field`).

En-tête optionnel `Idempotency-Key` : 1–255 caractères ASCII imprimables (`0x21`–`0x7E`).

## 2. Entrée partagée `PollInput` (`@rms/widget-model`)

Forme commune aux deux écrivains, avant transformation :

```js
{ question, answers: [{ id, text }], answerCounters?: { [id]: number }, brand, theme }
```

- Dashboard : `question = formData.pollTxt`, `answers = formData.answerTxts` (ids générés par
  `PollForm.jsx`), `answerCounters = formData.answerCounters`.
- API : `answers = request.answers.map(text => ({ id: randomUUID(), text }))`, pas de compteurs.

`validatePoll(PollInput)` → `ValidationError[]` (ordre stable) :

| `field` | `code` | Condition |
|---|---|---|
| `theme` | `required` / `invalid_value` | absent ou vide / hors énumération |
| `question` | `required` / `invalid_type` | absente ou vide après rognage / non-chaîne |
| `answers` | `required` / `invalid_type` / `too_few` | absent / non-tableau / < 2 éléments |
| `answers[i]` | `invalid_type` / `required` | texte non-chaîne / vide après rognage (i base 0) |
| `brand` | `invalid_value` | non vide et hors énumération |

`buildPollSaveData(PollInput)` → enregistrement plat legacy consommé par `transformWidgetData` :

```js
{ type: 'poll', pollTxt, answerTxts: [{ id, text }], answerCounters: { [id]: n }, brand, theme }
```

## 3. Document Firestore produit (`widgets/{id}`)

Produit par `transformWidgetData({ ...buildPollSaveData(input), id, author, deleted: false },
{ serverTimestamp })` :

```json
{
  "type": "poll",
  "meta": {
    "id": "<id du document>",
    "brand": "blick",
    "theme": "Sport",
    "author": "jane.doe@ringier.ch",
    "deleted": false,
    "timeCreated": "<horodatage serveur>",
    "timeUpdated": "<horodatage serveur>",
    "title": "<question rognée>"
  },
  "stats": {
    "views": 0,
    "answerCounters": { "<uuid-1>": 0, "<uuid-2>": 0 }
  },
  "data": {
    "question": "<question rognée>",
    "answerTxts": [{ "id": "<uuid-1>", "text": "Oui" }, { "id": "<uuid-2>", "text": "Non" }]
  }
}
```

Identique à la forme relevée sur les 493 sondages de production (`meta` 8 clés, `data`
`answerTxts`+`question`, `stats` `answerCounters`+`views`).

**Id du document** : auto-généré, ou `sha256(callerEmail + "\n" + Idempotency-Key)` hex[0..20].

## 4. Résultat (`CreatePollResponse`)

| Champ | Exemple |
|---|---|
| `id` | `9f2c41d07ab35e6c1d84` |
| `embedUrl` | `<CLIENT_BASE_URL>poll/?pollDoc=<id>&brand=<brand>` |

`buildEmbedUrl({ type, id, brand }, clientBaseUrl)` est la seule règle d'URL, partagée avec le
bouton « copier » du dashboard.

## 5. Lecture (`GET /polls/{id}` → `Poll`)

| Champ | Source |
|---|---|
| `id` | `meta.id` |
| `embedUrl` | `buildEmbedUrl({ type: 'poll', id, brand: meta.brand })` |
| `question` | `data.question` |
| `answers[]` | `data.answerTxts[]` dans l'ordre, `{ id, text, votes }` avec `votes = stats.answerCounters[id]` (0 si absent) |
| `totalVotes` | somme des `votes` des réponses listées |
| `theme`, `brand` | `meta.theme`, `meta.brand` |

## 6. Correction (`PATCH /polls/{id}`)

Correction limitée : seuls `data.question` (et `meta.title`, qui le reflète dans la liste du
dashboard, si fournie) et `data.answerTxts` (si `answers` fourni) changent, plus
`meta.updatedBy = editor` et `meta.updatedAt = serverTimestamp()`. Les ids de `answers` doivent
être exactement ceux stockés, dans le même ordre (pas d'ajout, de retrait ni de
réordonnancement) : `stats.answerCounters` n'est **jamais** écrit — aucune perte de votes
possible par l'API. Rubrique et marque se corrigent dans le dashboard. Transaction
lecture-écriture (1 lecture + 1 écriture), un vote en cours n'est pas écrasé.

## 7. Cycle de vie

Création (`POST`) et correction (`PATCH`) via l'API ; lecture (`GET`). La suppression reste dans
le dashboard (logique `meta.deleted`).
