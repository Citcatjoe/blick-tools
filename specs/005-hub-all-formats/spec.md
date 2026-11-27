# Feature Specification: Teasers, dossiers, NatiNotes, joueur·euse du match et faits marquants créables par l'API

**Feature Branch**: `005-hub-all-formats`

**Created**: 2026-11-27

**Status**: Implemented — non déployé

**Input**: César, après la spec 004 : le Hub Rédaction (extension Sidekick) doit pouvoir créer les
autres formats du Studio, avec des règles communes au dashboard et à l'API, comme le calendrier, le
tinder et le quiz.

## Clarifications

### Session 2026-11-27

- Q: Quels formats ? → A: teaser, dossier (`folder`), NatiNotes (`natinotes`), joueur·euse du
  match (`potm`), faits marquants (`facts`), livrés dans cet ordre. **Témoignage (`testimony`) et
  pronostic (`prono`) restent « Studio seulement »** : ni description, ni route.
- Q: Où vivent les règles ? → A: Dans `@rms/widget-model` (`validate<X>` / `build<X>SaveData`),
  utilisées par le dashboard (`Form.jsx`) et par l'API ; la description `WIDGET_FORMS` réutilise
  leurs constantes. Les documents écrits sont identiques à ceux du dashboard (même
  `transformWidgetData`, compteurs à 0) : les apps clientes ne changent pas.
- Q: Texte enrichi (commentaire des notes, textes des faits) ? → A: `sanitizeRichText(html,
  { inline })` du modèle, sans dépendance : garde `<p>`, `<br>`, `<strong>`, `<em>`,
  `<a href="http(s)…">` (avec `target="_blank" rel="noopener noreferrer"`), échappe ou retire le
  reste ; `<b>`/`<i>` → `<strong>`/`<em>` ; `inline` (citations des faits, commentaire des notes,
  saisi d'un seul bloc dans le dashboard) : sans paragraphes. Appliqué par
  `build` ; la validation refuse un texte vide après nettoyage. Le dashboard passe par la même
  fonction : un texte collé dans l'un ou l'autre est enregistré pareil.
- Q: Comment le Hub choisit-il les joueurs des notes ? → A: `GET /teams` publie les effectifs
  (collection `teams`, lecture seule, joueurs archivés exclus, triés par nom ;
  `listTeamsForPicker` du modèle). La requête ne porte que l'`id` du joueur ; nom, équipe, portrait
  et cadrage sont copiés depuis l'effectif à la création. Ajouter un joueur reste une action du
  dashboard (`?teams`, `?teams=<id>`).
- Q: Dates seules (joueur·euse du match, faits marquants) ? → A: `2026-12-20`, enregistrées à midi
  heure suisse (`parseDate`), comme le dashboard (`new Date(date + 'T12:00:00')` sur un poste en
  Suisse) ; la lecture rend le même format.
- Q: Postes du joueur·euse du match ? → A: valeur neutre dans la requête (`Attaquant`, `Défenseur`,
  `Milieu`, `Gardien`, `Entraîneur`, `Entraîneuse` ; libellés « Attaquant·e »…), accordée par
  `build` selon la catégorie comme `PotmForm.jsx` ; la lecture rend le poste enregistré. `text` est
  le match (« Suisse - Canada »), affiché sous la question du vote.
- Q: Images ? → A: Mécanisme du quiz, généralisé : champs `kind: image` de la description (listes
  et variantes comprises), copiés sous `images.prefix` du format (`teasers`, `folders`, `factss` —
  préfixe actuel du dashboard, `quizs` inchangé). Même nettoyage en cas d'échec, erreur `400` sur
  le chemin de l'image (`img`, `items[2].src`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le Hub crée les 5 formats (Priority: P1)

**Acceptance Scenarios**:

1. **Given** l'appelant autorisé, **When** il envoie un `POST /teasers`, `/folders`, `/natinotes`,
   `/potms` ou `/facts` valide, **Then** `201 { id, embedUrl }` et un document identique à celui du
   dashboard ; rejeu avec la même `Idempotency-Key` → `200` + `Idempotent-Replayed: true`, même id.
2. **Given** un widget créé, **When** `GET /<ressource>/{id}`, **Then** contenu + compteurs : teaser
   `views`, `clicks` ; dossier `views`, `clicks` par bouton ; notes `views`, `ratings` par joueur ;
   joueur·euse du match `views`, `votes` par joueur ; faits `views`, `reveal`, `ratingStats`.
3. **Given** une image par URL ou par `POST /images`, **Then** une copie sous le préfixe du format,
   l'URL d'origine n'est jamais stockée ; image illisible → `400` sur son chemin, copies supprimées.
4. **Given** `GET /teams`, **Then** `{ teams }` sans joueurs archivés ; un `players[i].id` inconnu ou
   archivé dans `POST /natinotes` → `400` sur ce chemin.

### Edge Cases

- Item des faits portant un champ d'un autre type → `400 unknown_field` sur son chemin ; deux items
  `rating` → `400`.
- Équipe du joueur·euse du match hors du contexte choisi → `400` sur `players[i].team`.
- Sans jeton `401`, hors liste blanche `403`, autre méthode `405` (`Allow: POST` sur la collection,
  `GET` sur un id ou `/teams`).

## Requirements *(mandatory)*

- **FR-001**: `WIDGET_FORMS` décrit les 9 formats ouverts à l'API, dans l'ordre poll, calendar,
  tinder, quiz, teaser, folder, natinotes, potm, facts. Nouveaux types de champ : `date`, `number`,
  `richtext`, `choice` + `source: 'teams'`, `choice` + `dependsOn`/`optionsBy`, `list` + `variants`.
- **FR-002**: Les routes de l'API sont dérivées de `RESOURCE_TYPES` (plus de liste en dur) ;
  `GET /teams` ajouté.
- **FR-003**: Import d'images générique (chemins et préfixe pris dans la description) ; plus de cas
  particulier du quiz.
- **FR-004**: `firestoreStore` lit `teams` (SDK Admin) ; aucun nouveau rôle IAM
  (`roles/datastore.user` couvre la lecture).
- **FR-005**: Le dashboard passe par les mêmes `validate*`/`build*` pour ces 5 formats ; ses
  documents ne changent pas.

## Success Criteria

- `npm run test:widget-model` et `npm run test:api` verts : par format une création, une lecture et
  un rejeu idempotent ; import d'images (teaser, dossier, faits) ; `GET /teams` ; joueur inconnu ;
  routage de chaque ressource et `405` ; description confrontée aux règles pour les 9 formats.
- Contrat [`openapi.yaml`](../001-poll-create-api/contracts/openapi.yaml) 1.4.0.
- Relais Sidekick (`backend/src/blick-tools.js`, `BLICK_TOOLS_RESOURCES`) à étendre aux nouvelles
  ressources et à `/teams` dans le dépôt du Hub.
