# Implementation Plan: Création de calendriers, tinders et quiz depuis le Hub Rédaction

**Branch**: `002-hub-widgets-api` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-hub-widgets-api/spec.md`

## Summary

Ajouter à l'API Cloud Run existante (`apps/api`) trois ressources typées sur le modèle de
`/polls` : `POST`/`GET` `/calendars`, `/tinders`, `/quizzes`, avec la même authentification,
idempotence, limite de corps et le même format d'erreurs. Les règles et la construction des trois
formats sortent de `Form.jsx` vers `@rms/widget-model` (`validateCalendar`/`buildCalendarSaveData`,
etc.), consommées par le dashboard et l'API. Les images de quiz sont téléchargées par l'API depuis
une URL https, converties comme dans le dashboard (WebP, ≤ 1928 px, ≈ 75 Ko) et copiées dans le
Firebase Storage de l'environnement. Déploiement en test (`widget-studio-test`) puis en production.

## Technical Context

**Language/Version**: JavaScript ESM ; Node 22 (API), navigateur via Vite (dashboard)

**Primary Dependencies**: existantes (`firebase-admin` 14, `google-auth-library` 11) + `sharp`
0.35 (conversion d'images, binaire précompilé linux-x64 glibc, compatible `node:22-slim`).
`firebase-admin/storage` (déjà inclus) pour le bucket.

**Storage**: Firestore `widgets` ; Firebase Storage, préfixe `quizs/` (même convention que
`ImageUploader.jsx` : `${type}s/<horodatage>_<nom>.webp`), URL de téléchargement à jeton.

**Testing**: `node --test` (module partagé + API, store et stockage d'images en mémoire, client
OIDC factice, téléchargeur d'images injecté) ; lint + build Vite + comparaison avant/après pour le
dashboard ; recette réelle en test puis en prod.

**Target Platform**: Cloud Run (test `europe-west6`, prod `europe-west1`)

**Project Type**: web-service + bibliothèque partagée (monorepo existant)

**Performance Goals**: création sans image < 2 s p95 ; quiz avec images < 10 s p95 (téléchargement
+ conversion séquentiels bornés)

**Constraints**: corps ≤ 64 Kio (inchangé) ; image source ≤ 10 Mo, délai 10 s, https uniquement,
hôtes privés refusés (anti-SSRF) ; compte de service : rôle Storage limité au bucket de
l'environnement

**Scale/Scope**: prod au 2026-11-26 : 9 calendriers, 4 tinders, 25 quiz actifs ; jusqu'à 25 dates
et 22 questions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|---|---|---|
| I. Modèle 4 blocs | Documents produits par `transformWidgetData` partagé ; aucun champ racine ajouté | ✅ |
| II. Compteurs par id | Ids générés pour cartes de tinder et questions de quiz ; `tinderVotes[cardId]`, `statsQuestions[questionId]` ; la création de quiz du dashboard (tableau par position, 1ʳᵉ question sans id) est corrigée par le builder partagé | ✅ (corrige un écart existant) |
| III. Une seule fabrique | `validate*`/`build*SaveData` pour les 3 formats dans `@rms/widget-model`, branches de `Form.jsx` remplacées | ✅ |
| IV. Moindre privilège | Même OIDC + liste blanche ; droit Storage ajouté **au niveau du bucket** (`roles/storage.objectAdmin` sur le seul bucket, pas sur le projet) ; anti-SSRF sur le téléchargement | ✅ |
| V. Simplicité | Une dépendance ajoutée (`sharp`), justifiée par la conversion d'images exigée (FR-010) ; routes typées sans abstraction générique | ✅ |

Re-check post-design : ✅, *Complexity Tracking* vide.

## Project Structure

### Documentation (this feature)

```text
specs/002-hub-widgets-api/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── README.md        # pointe vers le contrat unique de l'API (001/contracts/openapi.yaml, étendu)
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/widget-model/
├── calendar.js          # validateCalendar, buildCalendarSaveData
├── tinder.js            # validateTinder, buildTinderSaveData
├── quiz.js              # validateQuiz, buildQuizSaveData
├── common.js            # THEMES, BRANDS, isBlank… (partagé avec poll.js)
└── test/widgets.test.js

apps/api/src/
├── app.js               # routage générique /<ressource>[/<id>] → handlers par type
├── widgets.js           # create/get par type (calendar, tinder, quiz) : parse, idempotence, réponse
├── dates.js             # parseDateTime (ISO 8601, défaut Europe/Zurich)
├── images.js            # fetchImageSafely (anti-SSRF), toDashboardWebp (sharp)
├── imageStore.js        # Firebase Storage : put (jeton de téléchargement), remove
├── config.js            # + STORAGE_BUCKET obligatoire
└── server.js            # + bucket Storage
apps/api/test/widgets.test.js

apps/backend/src/components/Form/Form.jsx   # branches calendar/tinder/quiz → module partagé
apps/backend/src/components/Form/QuizForm.jsx # 1ʳᵉ question avec id dès la création
```

**Structure Decision**: un module par format dans le package partagé (même découpage que
`poll.js`) ; côté API un seul module `widgets.js` table-driven pour les trois formats (même
squelette create/get, seules la validation, la construction et la projection de lecture
diffèrent), `polls.js` inchangé.

## Complexity Tracking

Aucune violation.
