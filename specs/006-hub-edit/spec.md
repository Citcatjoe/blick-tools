# Feature Specification: Modifier les 11 formats depuis le Hub Rédaction

**Feature Branch**: `006-hub-edit`

**Created**: 2026-11-27

**Status**: Implemented — non déployé.

**Input**: L'extension Sidekick (Hub Rédaction) doit pouvoir modifier les widgets déjà placés dans
un article : elle pré-remplit son formulaire avec `GET /<ressource>/{id}` → `form` et enregistre
avec `PUT /<ressource>/{id}`.

## Clarifications

### Session 2026-11-27

- Q: Quelles règles ? → A: **Parité avec l'édition du dashboard** : ce que le dashboard permet de
  modifier se modifie par l'API, avec les mêmes `validate*` / `build*SaveData` /
  `transformWidgetData` qu'une création et le même sort des compteurs que les transactions
  d'édition de `apps/backend/src/components/Form/Form.jsx` (`handleSave`, mode édition). Le
  dashboard garde ses transactions (inchangé dans ce chantier).
- Q: Où vit la logique ? → A: Dans `@rms/widget-model`, par format : `<x>FormFromDoc(doc)` (document
  → requête de création, inverse de `build` + `transformWidgetData`) et `<x>StatsOnEdit(current,
  next)` (compteurs conservés) ; `calendarEditInput`, `natinotesEditInput`, `pronoEditInput`
  (valeurs que l'API ne publie pas, reprises du document). Points d'entrée : `widgetFormFromDoc`,
  `widgetEditInput`, `widgetStatsOnEdit`, `widgetVersion`, `editRequestFieldKeys`,
  `WIDGET_EDIT_ID_LISTS` (`edit.js`, `forms.js`). Lecture des dates (`formatDate`,
  `formatDateTime`, `timestampToDate`) : `dates.js`, déplacé de `apps/api` dans le modèle.
- Q: Forme de `form` ? → A: Celle de la requête de création (mêmes clés que `WIDGET_FORMS`) : dates
  `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` heure suisse, textes avec vrais retours à la ligne (teaser,
  dossier), HTML restreint tel que stocké pour `richtext`, description d'un chiffre (faits)
  déséchappée, images = URL https du Storage, couleur de dossier en valeur de requête (`brand`,
  `sport` ; classe inconnue → `brand`), poste du joueur·euse du match ramené à sa valeur neutre ;
  sans `author`. Valeurs facultatives vides absentes (complément, indice, image de question,
  personne détourée, lien global, `nbElemsToShow` « Toutes », légende masquée, date limite) ;
  booléens toujours présents. `brand` = `meta.brand` (défaut `blick`).
- Q: Ids ? → A: Les éléments qui ont un id stocké le portent dans `id` : réponses de sondage
  (`answers` devient `[{ id, text }]`), cartes, questions de quiz, dates de calendrier si elles en
  ont, boutons de dossier, candidats, faits marquants ; joueurs NatiNotes : `id` du joueur. En
  `PUT`, un id stocké est gardé à sa première occurrence ; un id inconnu ou répété est retiré :
  l'élément est nouveau (id généré, compteur à 0). Une nouvelle réponse de sondage peut rester un
  texte. `id` non-chaîne → `400 invalid_type`.
- Q: Concurrence ? → A: `version` = `meta.timeUpdated` en ISO (chaîne vide si illisible) ; les
  compteurs anonymes ne le touchent pas. `PUT` : lecture préalable (`404`, `409`, validation,
  images), puis transaction (`store.update`) qui relit le document, revérifie existence et version
  et écrit les blocs `type`, `meta`, `stats`, `data` en entier (comme `transaction.update` du
  dashboard). `meta.timeUpdated` = horodatage concret du serveur API (`Timestamp.now()`), pas le
  sentinel `serverTimestamp()`, pour renvoyer la nouvelle version sans relecture.
- Q: Méta ? → A: `meta.id`, `meta.author`, `meta.timeCreated` gardés ; `meta.deleted` = false ;
  `meta.title` recalculé ; `meta.lastEditor` = `editor` (e-mail, facultatif → « Hub Rédaction ») ;
  `theme`/`brand` de la requête. `author` dans le corps → `unknown_field`.
- Q: Images ? → A: Une nouvelle image (`POST /images` ou URL) est importée comme à la création
  (préfixe du format) ; une URL déjà enregistrée dans le widget est gardée sans téléchargement ni
  contrôle. L'ancienne copie remplacée **n'est pas supprimée** (un widget dupliqué dans le
  dashboard peut la partager ; nettoyage du Storage hors périmètre). Échec (`400` image,
  `409`/`404` dans la transaction, erreur d'écriture) : les copies faites pour cette requête sont
  supprimées.
- Q: NatiNotes ? → A: `previousPlayers` = joueurs déjà stockés (acceptés même archivés ou retirés
  des effectifs, avec leur instantané), comme le dashboard ; le `label` d'un ancien widget est
  conservé.
- Q: `PATCH /polls/{id}` ? → A: Gardé tel quel (anciennes extensions). Il ne change pas
  `meta.timeUpdated` : une correction par `PATCH` ne périme pas une `version` lue avant.

## Compteurs (parité dashboard)

| Format | Conservé | Différence avec le dashboard |
|---|---|---|
| tous | `stats` du document relu dans la transaction (vues, compteurs globaux), puis compteurs par élément ; `globalLinkClicks` retiré si le lien global l'est | Le dashboard lit `stats` hors transaction pour calendrier, tinder, teaser, témoignage (mise à jour simple) ; l'API les relit dans la transaction. |
| poll | `answerCounters[id]`, 0 pour une nouvelle réponse | — |
| calendar | vues, `seeAllClicks` | — |
| tinder | `tinderVotes[id]` (anciens : `data.tinderVotes`), `{ yes: 0, no: 0 }` pour une nouvelle carte | Dashboard : votes chargés à l'ouverture du formulaire. |
| quiz | `statsQuestions[id]` (anciens : par position), distribution des scores ramenée à 0..n | Les autres clés éventuelles de `statsGlobal` sont gardées (le dashboard ne garde que `scoreDistribution`). |
| teaser, testimony | vues, `clicks` / `msgSent` | — |
| folder | `buttonClicks[id]`, sinon ancien bouton (même id, même lien + texte, même lien) | — |
| natinotes | `playerRatings[id]` des joueurs gardés | — |
| potm | `playersVotes[id]`, sinon ancien candidat (même id, même nom) | — |
| facts | vues, `reveal`, `ratingStats` tel quel ; `itemCounters` retiré | — |
| prono | `itemVotes.item1/2/3` (anciens : `pronoData.<item>.votes`) | — |

Valeurs propres au dashboard conservées : options avancées des dates de calendrier (fin, badge,
lien live) pour les dates retrouvées par id — une date sans id stocké (cas normal) est réécrite
sans elles ; couleur d'une équipe de pronostic inchangée (nouvelle équipe → sa couleur,
comme `PronoForm.jsx`) ; `label` NatiNotes.

## Requirements

- **FR-001**: `GET /<ressource>/{id}` (11 formats, `GET /polls/{id}` compris) rend en plus `form` et
  `version`.
- **FR-002**: `PUT /<ressource>/{id}` (11 formats) : corps = requête de création (mêmes
  `unknown_field`, sans `author`) + `version` (obligatoire) + `editor` ; `id` accepté en plus sur
  les éléments des listes de `WIDGET_EDIT_ID_LISTS`. `200 { id, embedUrl, version }` ; `404`
  absent, supprimé (`meta.deleted`) ou d'un autre format ; `409 VERSION_CONFLICT` ; `400
  VALIDATION_FAILED` (mêmes chemins qu'à la création) ; `415` ; `405` avec `Allow: GET, PUT`
  (`GET, PATCH, PUT` pour `/polls/{id}`).
- **FR-003**: `firestoreStore` : `now()` (horodatage concret) ; `update(id, compute)` accepte des blocs
  de premier niveau dans `patch`.
- **FR-004**: Aucune écriture du dashboard modifiée.

## Success Criteria

- `npm run test:widget-model` : `widgetFormFromDoc(build(...))` redonne la requête pour les 11
  formats ; compteurs par id (retrait, ajout, réordonnancement) pour chaque format ; ids inconnus
  ou répétés ; valeurs propres au dashboard conservées.
- `npm run test:api` : par format, `GET` `form`/`version` puis `PUT` → `200`, document attendu,
  compteurs gardés ; le formulaire relu renvoyé tel quel ne change ni contenu ni compteurs (11
  formats) ; `409` sur version périmée et sur écriture concurrente (copies d'images supprimées) ;
  `404` ; `400` ; `unknown_field` ; images (nouvelle importée, ancienne gardée).
- Contrat [`openapi.yaml`](../001-poll-create-api/contracts/openapi.yaml) 1.6.0 ; brief Hub
  [`integration-hub.md`](../001-poll-create-api/integration-hub.md).
- À faire côté Hub : relais `PUT` pour les 11 ressources (`backend/src/blick-tools.js`) et
  formulaires d'édition pré-remplis par `form`.
