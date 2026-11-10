# Implementation Plan: API de création de sondages pour le Hub Rédaction

**Branch**: `001-poll-create-api` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-poll-create-api/spec.md`

## Summary

Exposer `POST /polls` (Cloud Run, projet GCP de Blick Tools, un service par environnement) qui
authentifie le Hub Rédaction par jeton OIDC Google + liste blanche, valide la demande, écrit un
document `widgets` 4 blocs en une opération et renvoie `{ id, embedUrl }`. La validation `poll`,
la transformation formulaire → 4 blocs (`transformWidgetData`, tous types) et la construction de
l'URL d'embed sortent de `apps/backend` vers un nouveau package pur `@rms/widget-model`, consommé
par le dashboard et l'API : les deux écrivains produisent le même document par construction.

## Technical Context

**Language/Version**: JavaScript ESM ; Node 22 (API), navigateur via Vite 6 (dashboard)

**Primary Dependencies**: API : `firebase-admin` 14, `google-auth-library` 11, `node:http` (pas
de framework). Package partagé : aucune dépendance.

**Storage**: Firestore, collection `widgets` (projet `blick-tools-app` en test,
`blick-tools-app-42a99` en production)

**Testing**: `node --test` (package partagé + API, store en mémoire et vérificateur OIDC
injectés) ; lint ESLint + build Vite pour le dashboard

**Target Platform**: Cloud Run (conteneur Linux `node:22-slim`)

**Project Type**: web-service + bibliothèque partagée dans le monorepo existant

**Performance Goals**: p95 < 2 s hors démarrage à froid (SC-005) ; une écriture Firestore par
création, une lecture supplémentaire seulement en cas de rejeu idempotent

**Constraints**: corps ≤ 64 Kio ; aucune configuration implicite vers la production ; aucun
secret partagé ; compte de service dédié rôle *Cloud Datastore User*

**Scale/Scope**: un appelant (Hub Rédaction), quelques dizaines de créations par jour (prod :
493 sondages au total au 2026-11-09)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|---|---|---|
| I. Modèle 4 blocs | Le document est produit par `transformWidgetData` partagé ; `meta.id` posé avant l'écriture unique ; aucun champ racine ajouté (idempotence sans champ de stockage, cf. research R4) | ✅ |
| II. Compteurs par id | Ids de réponses générés côté serveur (`randomUUID`) ; `stats.answerCounters[id] = 0` ; le dashboard garde sa transaction d'édition | ✅ |
| III. Une seule fabrique | Validation `poll`, transformation (tous types) et URL d'embed déplacées dans `@rms/widget-model` ; copies inline supprimées de `Form.jsx`/`ListItem.jsx` | ✅ |
| IV. Moindre privilège | OIDC + liste blanche ; compte de service `api-blicktools-ecriture` dédié ; config obligatoire validée au démarrage, pas de fallback prod | ✅ |
| V. Simplicité | `node:http` sans framework, 2 dépendances serveur ; extraction limitée au cobaye `poll` pour la validation | ✅ |

Re-check post-design (après data-model/contrat) : ✅ aucun écart, *Complexity Tracking* vide.

## Project Structure

### Documentation (this feature)

```text
specs/001-poll-create-api/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/widget-model/            # @rms/widget-model — pur, sans Firebase
├── package.json
├── index.js                      # ré-exports
├── transform.js                  # transformWidgetData(docItem, { serverTimestamp })
├── poll.js                       # POLL_BRANDS, POLL_THEMES, validatePoll, buildPollSaveData
├── embed.js                      # DEFAULT_CLIENT_BASE_URL, buildEmbedUrl
└── test/
    └── poll.test.js

apps/api/                         # service Cloud Run (dossier du repo racine, pas de .git)
├── package.json
├── Dockerfile
├── Dockerfile.dockerignore
├── cloudbuild.yaml
├── README.md
├── src/
│   ├── server.js                 # entrée : config + firebase-admin + listen
│   ├── config.js                 # loadConfig(env), échec au démarrage si incomplet
│   ├── app.js                    # createApp(deps) → handler node:http, routage, corps
│   ├── auth.js                   # createCallerVerifier (OIDC Google + liste blanche)
│   ├── polls.js                  # parseCreatePollRequest, createPoll (idempotence)
│   ├── firestoreStore.js         # adaptateur firebase-admin (create/get, erreurs gRPC)
│   └── errors.js                 # ApiError, réponse problem+json
└── test/
    └── polls.test.js

apps/backend/src/components/Form/Form.jsx       # consomme validatePoll, buildPollSaveData,
                                                 # transformWidgetData
apps/backend/src/components/ListItem/ListItem.jsx  # consomme buildEmbedUrl
```

**Structure Decision**: nouveau package `packages/widget-model` plutôt qu'un ajout à
`@rms/services`, parce que `@rms/services/index.js` initialise le SDK Firebase client et lit
`import.meta.env` au chargement : inutilisable dans Node. Le service vit dans `apps/api` (les
workspaces couvrent `apps/*`) et dépend du package par `file:../../packages/widget-model` pour
que l'image Docker s'installe sans le reste du monorepo.

## Complexity Tracking

Aucune violation.
