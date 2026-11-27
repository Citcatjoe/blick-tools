---
description: "Tâches — mêmes règles dashboard / API, envoi d'image de quiz"
---

# Tasks: Mêmes règles dashboard / API, et envoi d'image de quiz

**Input**: `specs/003-hub-parity-images/` · **Tests**: `node --test` (constitution)

## Phase 1: Modèle partagé (US1)

- [X] T001 `tinder.js` : exactement 3 cartes (`TINDER_CARDS`), message commun
- [X] T002 `quiz.js` : `questions[i].img` vide ou URL https
- [X] T003 `calendar.js` : options avancées des dates validées (types) et conservées par `build`
- [X] T004 `test/widgets.test.js`

## Phase 2: Dashboard (US1)

- [X] T005 `Form.jsx` : options avancées transmises au modèle ; repli mort de la légende supprimé
- [X] T006 `CalendarForm.jsx` : commentaire à jour, exemple d'URL en `https://`

## Phase 3: API (US1, US2)

- [X] T007 `widgets.js` : `legend` (tinder) + lecture ; règle d'image retirée (dans le modèle) ; images via `imageStore.adopt`
- [X] T008 `uploads.js` + route `POST /images` ; `images.js` (codes d'erreur, formats admis) ; `imageStore.js` (`UPLOAD_PREFIX`, `adopt`, `parseStorageUrl`)
- [X] T009 `apps/api/test/widgets.test.js` : tinder 1–2 cartes, légende, `POST /images` (201, type refusé, trop lourd, illisible, 401/403/405), quiz avec envoi / image du bucket / envoi expiré / mauvais jeton

## Phase 4: Contrat, docs, déploiement

- [ ] T010 `openapi.yaml` 1.2.0, `integration-hub.md`, `002/data-model.md`, `apps/api/README.md` (cycle de vie), `ENVIRONNEMENTS.md`
- [ ] T011 Règle de cycle de vie `hub-uploads/` 7 jours sur les buckets test et prod (approbation)
- [ ] T012 Test : déploiement, recette réelle (SC-001)
- [ ] T013 Prod : déploiement, recette réelle (SC-001) avec approbation
- [ ] T014 Dashboard : build test + prod pour l'upload FTP
