# Contrat

L'API n'a qu'un contrat OpenAPI, tenu à jour à chaque fonctionnalité :
[`specs/001-poll-create-api/contracts/openapi.yaml`](../../001-poll-create-api/contracts/openapi.yaml).

Cette fonctionnalité y ajoute `POST`/`GET` `/calendars`, `/tinders`, `/quizzes` et leurs schémas
(`CreateCalendarRequest`, `Calendar`, `CreateTinderRequest`, `Tinder`, `CreateQuizRequest`,
`Quiz`). Détail des champs : [`data-model.md`](../data-model.md).
