# Implementation Plan: Mêmes règles dashboard / API, et envoi d'image de quiz

**Branch**: `003-hub-parity-images` | **Date**: 2026-11-27 | **Spec**: [spec.md](./spec.md)

## Summary

Les règles manquantes passent dans `@rms/widget-model` (tinder à 3 cartes, image de quiz https,
options avancées du calendrier conservées). L'API gagne `legend` pour le tinder et une route
`POST /images` (corps brut) qui réutilise la conversion des images importées par URL ; les envois
vivent sous un préfixe à durée de vie limitée et sont copiés sous `quizs/` quand un quiz les utilise.

## Technical Context

Node 22, `node:http`, `sharp`, `@google-cloud/storage` (SDK Admin), Cloud Run (corps ≤ 32 Mo).
Tests `node --test`. Aucun nouveau rôle IAM : `roles/storage.objectAdmin` sur le bucket couvre
dépôt, lecture des métadonnées, copie et suppression.

## Constitution Check

- Principe I (fabrique unique) : toute règle dans `packages/widget-model`, plus aucune règle d'image
  dans `apps/api/src/widgets.js`. ✔
- Principe II (compteurs par id) : inchangé. ✔
- Écritures prod : approbation explicite (règle de cycle de vie, déploiement). ✔

## Decisions

- **D1 — Corps brut** (contrat du Hub) : pas de multipart ; `Content-Type` dans
  `image/jpeg|png|webp|gif`, puis format réel vérifié par `sharp` (un fichier mal étiqueté hors liste
  est refusé). Corps > 10 Mo refusé sans être gardé en mémoire, mais lu jusqu'au bout : fermer la
  connexion pendant l'envoi priverait le client de la réponse `400`.
- **D2 — Même traitement** que l'import par URL : `toDashboardWebp` (WebP, ≤ 1928 px, ≈ 75 Ko).
  `ImageError` porte désormais un code (`invalid_type`, `too_large`, `invalid_value`).
- **D3 — Nettoyage** : préfixe `hub-uploads/` + règle de cycle de vie `Delete` à 7 jours limitée à ce
  préfixe (`matchesPrefix`). Alternatives écartées : job planifié qui recense les images
  utilisées (code et planificateur à maintenir) ; tout garder (accumulation sans fin, même si chaque
  image ne fait que ≈ 75 Ko).
- **D4 — Adoption** (`imageStore.adopt`) : URL de téléchargement du bucket de l'environnement →
  métadonnées lues (existence, jeton, type image) ; envoi → copie sous `quizs/` avec nouveau jeton
  (nettoyée si la création échoue) ; autre objet → gardé tel quel (jamais supprimé par l'API).
  URL d'ailleurs → téléchargement comme avant.
- **D5 — Légende tinder** : `legend` texte ; non vide → `{ txt, display: true }` ; `GET` renvoie
  le texte affiché ou `null`.

## Project Structure

```
packages/widget-model/{tinder,quiz,calendar}.js, test/widgets.test.js
apps/backend/src/components/Form/{Form,CalendarForm}.jsx
apps/api/src/{uploads.js (nouveau), images.js, imageStore.js, widgets.js, app.js}
apps/api/test/widgets.test.js
specs/001-poll-create-api/contracts/openapi.yaml (1.2.0), integration-hub.md
specs/002-hub-widgets-api/data-model.md, apps/api/README.md, ENVIRONNEMENTS.md
```
