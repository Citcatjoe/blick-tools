# Feature Specification: Mêmes règles dashboard / API, et envoi d'image de quiz depuis le Hub

**Feature Branch**: `003-hub-parity-images`

**Created**: 2026-11-27

**Status**: Implemented — en attente de déploiement

**Input**: demande du Hub Rédaction (`PROMPT-blick-tools-regles-et-images.md`) après la recette de la
spec 002 : (1) les règles de validation diffèrent entre un widget créé par le dashboard et par
l'API ; (2) le dashboard permet de choisir l'image d'une question de quiz sur l'ordinateur, l'API
n'accepte qu'une adresse https.

Règle : **un widget valide dans le dashboard est valide par l'API, et inversement**.
`packages/widget-model` porte toutes les règles ; une contrainte propre à un formulaire est un
écart à corriger.

## Clarifications

### Session 2026-11-27

- Q: Que faire des images envoyées mais jamais utilisées ? → A: Les envois sont déposés sous un
  préfixe dédié (`hub-uploads/`) qu'une règle de cycle de vie du bucket supprime après 7 jours ; un
  quiz qui utilise un envoi en reçoit une copie sous `quizs/`, permanente. Aucun job à maintenir.
- Q: Quand `POST /quizzes` reçoit une image qui est déjà dans le stockage Blick Tools ? → A: Pas de
  nouveau téléchargement. Envoi du Hub : copie interne sous `quizs/`. Autre image du bucket (dashboard,
  quiz existant) : gardée telle quelle. Dans les deux cas l'objet doit exister et porter le jeton de
  l'URL.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mêmes règles partout (Priority: P1)

Le Hub crée un widget que le dashboard accepte ; le dashboard réenregistre sans erreur un widget
créé par le Hub ; une saisie refusée l'est des deux côtés, sur le même champ, avec le même message.

**Acceptance Scenarios**:

1. **Given** un tinder à 1 ou 2 cartes, **When** il est envoyé à `POST /tinders`, **Then** `400`
   `cards` / `too_few`, « Le tinder doit avoir exactement 3 cartes. » ; à 3 cartes → `201`.
2. **Given** un tinder avec légende dans le dashboard, **When** le Hub envoie la même légende,
   **Then** le document produit est le même (`tinderLegend { txt, display: true }`).
3. **Given** un calendrier existant qui porte des options avancées masquées (fin, badge, lien live),
   **When** il est réenregistré depuis le dashboard, **Then** ces valeurs sont conservées.

### User Story 2 - Envoyer l'image d'une question de quiz (Priority: P1)

Le journaliste choisit une image sur son ordinateur dans le Hub ; le Hub l'envoie à `POST /images`
et utilise l'`url` reçue dans `questions[i].img` de `POST /quizzes`.

**Acceptance Scenarios**:

1. **Given** un JPEG d'environ 300 Ko, **When** il est envoyé en corps brut (`Content-Type:
   image/jpeg`), **Then** `201 { url }` ; un quiz créé avec cette `url` affiche l'image.
2. **Given** un fichier non image, un format hors JPEG/PNG/WebP/GIF, plus de 10 Mo ou une image
   illisible, **Then** `400 VALIDATION_FAILED`, champ `image`, codes `invalid_type`, `too_large`,
   `invalid_value`.
3. **Given** un envoi jamais utilisé, **Then** il est supprimé automatiquement après 7 jours ; une
   `url` expirée envoyée à `POST /quizzes` donne `400` sur `questions[i].img`.

### Edge Cases

- Content-Type annoncé différent du format réel : le format réel décide (même refus `invalid_type`
  si hors liste).
- GIF animé : seule la première image est gardée (comme la conversion WebP du dashboard).
- URL du stockage avec un mauvais jeton : refusée (`questions[i].img`).
- Anciens documents que le formulaire ne sait pas réenregistrer (tinder à plus de 3 cartes, question
  de quiz à ≠ 4 réponses) : inchangé, refusés des deux côtés.

## Requirements *(mandatory)*

- **FR-001**: `validateTinder` exige exactement 3 cartes (`too_few` / `too_many` sur `cards`, même
  message dashboard et API).
- **FR-002**: `validateQuiz` exige une URL https pour `questions[i].img` (règle déplacée de l'API vers
  le modèle).
- **FR-003**: `POST /tinders` accepte `legend` (texte facultatif, affiché) ; `GET` la renvoie.
- **FR-004**: Le modèle conserve les options avancées des dates d'un calendrier réenregistré par le
  dashboard (régression de la spec 002) ; l'API ne les expose pas (le formulaire non plus).
- **FR-005**: `POST /images` : corps brut ≤ 10 Mo, JPEG/PNG/WebP/GIF, même traitement qu'une image
  importée par URL, dépôt sous `hub-uploads/`, `201 { url }` ; mêmes authentification et liste
  blanche que les autres routes.
- **FR-006**: `POST /quizzes` ne retélécharge pas une image du bucket de l'environnement (copie d'un
  envoi, conservation d'une autre image) et vérifie son existence et son jeton.
- **FR-007**: Les envois non utilisés sont supprimés après 7 jours (cycle de vie du bucket, préfixe
  `hub-uploads/` seulement).

## Audit des formulaires (écarts trouvés)

| Format | Écart | Décision |
|---|---|---|
| Tinder | Formulaire : toujours 3 cartes ; modèle : 1 à 3 | Modèle : exactement 3 (FR-001) |
| Tinder | Légende réglable au dashboard, impossible par l'API | API : `legend` (FR-003) |
| Tinder | `Form.jsx` : repli mort `legend.display: true` | Supprimé (le formulaire envoie toujours la légende) |
| Quiz | Formulaire : image = `''` ou URL du Storage ; modèle : toute chaîne | Modèle : https (FR-002) ; l'API copie toujours l'image dans le Storage |
| Calendrier | Options avancées perdues au réenregistrement depuis la spec 002 | Conservées (FR-004) |
| Calendrier | Exemple d'URL « www.billeterie.com » refusé par le modèle | Exemple `https://…` |
| Calendrier | Dashboard : heure du navigateur ; API : heure suisse si pas de décalage | Inchangé : même instant pour une rédaction en Suisse ; documenté |
| Calendrier | Dates triées à la réouverture dans le dashboard | Inchangé : affichage, pas une règle |
| Sondage | Aucun | — |

Les attributs `required` / `type="url"` des formulaires sont décoratifs (pas de `<form>`, pas de
validation native) : seules les fonctions du modèle bloquent l'enregistrement.

## Success Criteria *(mandatory)*

- **SC-001**: Recette test puis prod : tinder 1/2 cartes refusé, 3 accepté ; `POST /images` (JPEG
  ≈ 300 Ko) → `201`, quiz créé avec l'`url` → image affichée dans l'iframe.
- **SC-002**: `npm run test:widget-model` et `npm run test:api` passent.

## Assumptions

- Hors périmètre : suppression de widgets, correction par l'API.
- Le Hub (relais + extension) est déjà écrit sur le contrat `POST /images` ci-dessus.
