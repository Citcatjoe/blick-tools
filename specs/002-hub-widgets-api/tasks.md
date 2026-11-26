---
description: "Tâches — calendriers, tinders et quiz via l'API"
---

# Tasks: Création de calendriers, tinders et quiz depuis le Hub Rédaction

**Input**: `specs/002-hub-widgets-api/` · **Tests**: `node --test` (constitution)

## Phase 1: Fondations (module partagé, bloquant)

- [X] T001 `packages/widget-model/common.js` : `WIDGET_THEMES`, `isBlank`, `blickOnlyBrand` ; `poll.js` réutilise les constantes communes (sans changer son comportement)
- [X] T002 [P] `packages/widget-model/calendar.js` : `validateCalendar`, `buildCalendarSaveData({ …, toTimestamp })`
- [X] T003 [P] `packages/widget-model/tinder.js` : `validateTinder`, `buildTinderSaveData` (ids de cartes, votes à zéro, légende masquée par défaut)
- [X] T004 [P] `packages/widget-model/quiz.js` : `validateQuiz`, `buildQuizSaveData` (ids de questions, `statsQuestions` par id, `scoreDistribution` 0..n)
- [X] T005 `packages/widget-model/index.js` + `test/widgets.test.js` (ordre des erreurs, documents produits via `transformWidgetData`)

## Phase 2: User Story 5 — dashboard sur la fabrique partagée (P1)

- [X] T006 `Form.jsx` : branches `calendar`, `tinder`, `quiz` → `validate*` (1ʳᵉ erreur → libellé surligné existant) + `build*SaveData`
- [X] T007 `QuizForm.jsx` : id sur la première question dès la création
- [X] T008 Vérification : lint sans nouvelle erreur, build Vite, comparaison avant/après (script jetable)

## Phase 3: User Stories 1–3 — création (P1/P2)

- [X] T009 [P] `apps/api/src/dates.js` : `parseDateTime` (ISO 8601, défaut Europe/Zurich)
- [X] T010 [P] `apps/api/src/images.js` : `fetchImageSafely` (https, anti-SSRF, 10 s, 10 Mo, redirections revalidées), `toDashboardWebp` (sharp)
- [X] T011 [P] `apps/api/src/imageStore.js` : `put` (jeton de téléchargement), `remove`
- [X] T012 `apps/api/src/widgets.js` : parse + validation + construction + idempotence (id incluant le type, existence vérifiée avant les images) + nettoyage des images si l'écriture échoue
- [X] T013 `app.js` (routes `/calendars`, `/tinders`, `/quizzes`), `config.js` (`STORAGE_BUCKET`), `server.js` (bucket), `package.json` (`sharp`)
- [X] T014 `apps/api/test/widgets.test.js` : 201 par format + document = fabrique partagée, 400 groupés, `brand: pme` refusé, fuseau, images (OK, http refusé, hôte privé refusé, non-image refusée, nettoyage si échec), rejeu 200/409 sans recopie d'image

## Phase 4: User Story 4 — lecture (P2)

- [X] T015 `GET /calendars|tinders|quizzes/{id}` : projections, `404` autre type/inexistant ; tests

## Phase 5: Contrat, docs, déploiement

- [X] T016 `001/contracts/openapi.yaml` (6 opérations, schémas), `integration-hub.md` (formats, portée, publication 1 clic à confirmer), `apps/api/README.md` (`STORAGE_BUCKET`, IAM bucket), `CLAUDE.md`
- [X] T017 Test : IAM bucket, build, déploiement, recette réelle (quickstart §3)
- [ ] T018 Prod : IAM bucket, build, déploiement (compte pro), contrôle (lecture d'un widget existant de chaque format)
