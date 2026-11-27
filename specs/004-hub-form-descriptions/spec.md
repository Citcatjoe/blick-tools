# Feature Specification: Description des formulaires de création, publiée pour le Hub

**Feature Branch**: `004-hub-form-descriptions`

**Created**: 2026-11-27

**Status**: Implemented — tests locaux ; déploiement test puis prod à faire (accord de César)

**Input**: César, après les specs 002 et 003 : les formulaires du Studio sont recopiés dans le Hub
Rédaction (extension Sidekick) pour qu'il crée les widgets, et les deux copies ont divergé (tinder à
3 cartes, maximum de réponses). Une seule description doit servir aux deux.

## Clarifications

### Session 2026-11-27

- Q: Le dashboard construit-il aussi ses formulaires à partir de la description ? → A: Non, pas
  maintenant. Ses formulaires font bien plus (options avancées, réordonnancement, recadrage) ; les
  règles lui sont déjà communes avec l'API (`validate*`). Règle tenue à la place : aucune contrainte
  dans un formulaire du dashboard, tout dans le modèle (CLAUDE.md, « Dépôt frère : Sidekick »).
- Q: Où vit la description ? → A: Dans `@rms/widget-model` (`forms.js`, `WIDGET_FORMS`), à côté des
  règles dont elle réutilise les constantes ; l'API la publie, le Hub la lit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le Hub construit ses formulaires à partir de la description (Priority: P1)

**Acceptance Scenarios**:

1. **Given** l'appelant autorisé, **When** il appelle `GET /widget-types`, **Then** `200 { formats }`
   : sondage, calendrier, tinder, quiz, avec pour chaque champ de la requête son type de saisie,
   son libellé, son exemple, son obligation et ses bornes.
2. **Given** une requête construite à partir de la description seule (champs obligatoires, listes
   au minimum, bonne réponse cochée), **When** elle est envoyée au `POST` du format, **Then** `201` ;
   avec tous les champs décrits, facultatifs compris, aussi.
3. **Given** cette requête privée d'un champ obligatoire, ou une liste hors de ses bornes, ou sans
   bonne réponse, **Then** `400` sur ce champ (ou sur `<parent>.correctAnswer`).

### Edge Cases

- Sans jeton : `401` ; appelant hors liste blanche : `403` ; autre méthode que `GET` : `405`.
- Un champ ajouté à la description est aussitôt accepté par l'API (même liste) ; une borne changée
  dans une règle sans la description fait échouer les tests de l'API.

## Requirements *(mandatory)*

- **FR-001**: `WIDGET_FORMS` décrit les 4 formats ouverts à l'API, en JSON pur, avec les constantes
  des règles (`TINDER_CARDS`, `QUIZ_ANSWERS_PER_QUESTION`, `CALENDAR_MAX_ELEMENTS_CHOICE`, rubriques,
  marques).
- **FR-002**: Les champs acceptés par les créations (`unknown_field` sinon) viennent de la description
  (`requestFieldKeys`) : plus de liste propre à l'API.
- **FR-003**: `GET /widget-types` publie la description, même authentification que les autres routes.
- **FR-004**: Le dashboard et les documents Firestore ne changent pas.

## Success Criteria

- `npm run test:widget-model` et `npm run test:api` verts, dont un test par format qui confronte la
  description aux règles (exemple accepté, chaque champ obligatoire, chaque borne).
- Le Hub crée les 4 formats avec des formulaires construits à partir de `GET /widget-types`.
