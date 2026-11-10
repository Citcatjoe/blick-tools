---
description: "Tâches d'implémentation — API de création de sondages"
---

# Tasks: API de création de sondages pour le Hub Rédaction

**Input**: `specs/001-poll-create-api/` (plan, spec, research, data-model, contracts, quickstart)

**Tests**: inclus — la constitution impose `node --test` sur le package partagé et le service
serveur (comportements observables : documents produits, codes HTTP).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Créer `packages/widget-model/package.json` (`@rms/widget-model`, ESM, script `test`) et `packages/widget-model/index.js`
- [X] T002 [P] Créer `apps/api/package.json` (`firebase-admin`, `google-auth-library`, `@rms/widget-model` en `file:../../packages/widget-model`, scripts `start`/`test`)
- [X] T003 Ajouter `@rms/widget-model` aux dépendances de `apps/backend/package.json` ; scripts racine `dev:api`, `test:api`, `test:widget-model` dans `package.json` ; `npm install` à la racine

---

## Phase 2: Foundational (bloquant)

- [X] T004 Déplacer `transformWidgetData` (et `generateUnifiedTitle`) de `apps/backend/src/components/Form/Form.jsx` vers `packages/widget-model/transform.js`, `serverTimestamp` injecté
- [X] T005 [P] Implémenter `POLL_BRANDS`, `POLL_THEMES`, `validatePoll`, `buildPollSaveData` dans `packages/widget-model/poll.js` (règles research R3)
- [X] T006 [P] Implémenter `DEFAULT_CLIENT_BASE_URL`, `buildEmbedUrl` dans `packages/widget-model/embed.js`
- [X] T007 Tests `packages/widget-model/test/poll.test.js` : ordre et codes des violations, rognage, défaut de marque, document 4 blocs produit, URL `blick`/`pme`

**Checkpoint**: `npm run test:widget-model` vert.

---

## Phase 3: User Story 4 — Le dashboard produit les mêmes documents (P1)

**Goal**: le dashboard consomme le package ; aucune copie inline ne reste.

**Independent Test**: lint + build du dashboard ; comparaison avant/après de `transformWidgetData` sur un échantillon de chaque type.

- [X] T008 [US4] `apps/backend/src/components/Form/Form.jsx` : branche `poll` → `validatePoll` (+ table champ → libellé pour `triggerValidationError`) et `buildPollSaveData` ; supprimer la fonction inline et appeler `transformWidgetData(saveData, { serverTimestamp })`
- [X] T009 [P] [US4] `apps/backend/src/components/ListItem/ListItem.jsx` : `handleCopy` → `buildEmbedUrl` ; fallback de base → `DEFAULT_CLIENT_BASE_URL`
- [X] T010 [US4] Vérifier : lint `apps/backend` sans nouvelle erreur, build Vite dans un dossier temporaire, comparaison ancienne/nouvelle transformation (script jetable)

**Checkpoint**: dashboard inchangé pour les éditeurs (SC-006).

---

## Phase 4: User Story 1 + 2 — Créer un sondage / refus exploitables (P1)

**Goal**: `POST /polls` authentifié qui crée le document ou renvoie un problem+json précis.

**Independent Test**: `npm run test:api` ; démarrage réel avec jeton bidon → `401`.

- [X] T011 [P] [US2] `apps/api/src/errors.js` : `ApiError`, `sendProblem`, `sendJson`
- [X] T012 [P] [US2] `apps/api/src/config.js` : `loadConfig(env)` — `API_AUDIENCE`, `ALLOWED_CALLERS` (liste d'e-mails), `CLIENT_BASE_URL` (https, finit par `-`), `PORT` ; erreur listant tout ce qui manque
- [X] T013 [P] [US2] `apps/api/src/auth.js` : `createCallerVerifier({ audience, allowedCallers, client })` → `401`/`403` (research R5)
- [X] T014 [US1] `apps/api/src/polls.js` : `parseCreatePollRequest` (champs inconnus, `author`), `createPoll` (ids de réponses, document via le package, écriture unique, URL)
- [X] T015 [P] [US1] `apps/api/src/firestoreStore.js` : `newId`, `create` (→ `AlreadyExists`), `get`, traduction gRPC `UNAVAILABLE`/`DEADLINE_EXCEEDED`/`RESOURCE_EXHAUSTED`/`ABORTED` → `503`
- [X] T016 [US1] `apps/api/src/app.js` : routage `POST /polls` (`404`/`405`), auth avant corps, `415`, corps ≤ 64 Kio (`413`), `INVALID_JSON`, journal JSON (`severity`) sans jeton
- [X] T017 [US1] `apps/api/src/server.js` : `loadConfig`, `firebase-admin` (ADC), `OAuth2Client`, `listen(PORT)`, arrêt propre sur `SIGTERM`
- [X] T018 [US1] [US2] Tests `apps/api/test/polls.test.js` : `201` + document égal à la fabrique partagée, auteur par défaut/fourni, `400` toutes violations + champ inconnu + JSON illisible, `401`, `403`, `413`, `415`, `405`, `503`

**Checkpoint**: MVP — le Hub peut créer un sondage.

---

## Phase 5: User Story 3 — Rejouer sans doublon (P2)

- [X] T019 [US3] `apps/api/src/polls.js` : `Idempotency-Key` (format → `400 INVALID_IDEMPOTENCY_KEY`), id dérivé `sha256(caller + "\n" + key)`[0..20], `ALREADY_EXISTS` → relecture + comparaison → `200` `Idempotent-Replayed` ou `409`
- [X] T020 [US3] Tests dans `apps/api/test/polls.test.js` : rejeu identique → `200` même id, un document ; contenu différent → `409` ; deux appelants même clé → ids distincts

---

## Phase 6: Polish & déploiement

- [X] T021 [P] `apps/api/Dockerfile`, `apps/api/Dockerfile.dockerignore`, `apps/api/cloudbuild.yaml`
- [X] T022 [P] `apps/api/README.md` : variables, création du compte de service, IAM, déploiement test/prod, appel depuis le Hub
- [X] T023 Mettre à jour `CLAUDE.md` (package `@rms/widget-model`, `apps/api`, commandes, règle « une seule fabrique ») et `widget_structure_guide.md` §3
- [X] T024 Exécuter `quickstart.md` §1 (tests + démarrage réel `401`/config invalide)

## Phase 7: Lecture & correction (intégration Hub, 2026-11-10)

- [X] T025 `GET /polls/{id}` → `{ id, embedUrl, question, answers[{id,text,votes}], totalVotes, theme, brand }` ; `404` si absent ou non-poll
- [X] T026 `PATCH /polls/{id}` `{ question?, answers?, editor }` : textes seuls modifiés, ids strictement identiques (nombre + ordre), votes jamais écrits, transaction Firestore ; `meta.updatedBy`/`updatedAt`
- [X] T027 `validatePollEdits` dans `@rms/widget-model` (règle question/réponse partagée avec le POST et l'admin)
- [X] T028 Routage `GET`/`PATCH` dans `apps/api/src/app.js` (auth, `415`, corps ≤ 64 Kio, `400`/`404`, `405` Allow GET,PATCH)
- [X] T029 Tests : votes renvoyés, textes seuls changés, refus ids différents/nombre/ordre, 404, 403, 400 groupé
- [X] T030 Contrat (`contracts/openapi.yaml` GET+PATCH, schémas `Poll`/`PollUpdateRequest`), `integration-hub.md` (lire/corriger + Côté Hub), `data-model.md` §5-7

## Dependencies & Execution Order

- Setup → Foundational → (US4 ∥ US1/US2) → US3 → Polish.
- US1/US2 dépendent de T004–T006 (fabrique partagée) ; US3 dépend de T014.
- T005/T006, T011/T012/T013/T015, T021/T022 parallélisables (fichiers distincts).

## Hors périmètre (déploiement réel)

Exécutés par un propriétaire des projets GCP, documentés dans `apps/api/README.md` (facturation : Blaze actif sur test et prod) :
compte de service `api-blicktools-ecriture`, `roles/run.invoker` pour le compte du Hub, e-mail du
compte du Hub dans `ALLOWED_CALLERS`, `quickstart.md` §3.

- [X] Test (`blick-tools-app`) : déployé et recetté le 2026-11-09 — `https://blick-tools-api-704592955335.europe-west1.run.app`
  (201, rejeu 200, 409, 400, 401 applicatif, 403 Cloud Run ; document identique en forme à un sondage du dashboard ; vote compté par id).
- [ ] Production (`blick-tools-app-42a99`, compte pro) : mêmes étapes, sans `api-smoke-caller`.
