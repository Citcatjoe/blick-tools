# Spec — Nouveau widget « `natinotes` »

> Dérivé de `SPEC_TEMPLATE.md`. Références : `CLAUDE.md`, `widget_structure_guide.md`.
> Rappel : un widget = **3 faces indissociables** → (1) modèle Firestore, (2) app cliente iframe, (3) formulaire backend. Les trois doivent être cohérents.

### Conventions de lecture

Les blocs préfixés ci-dessous distinguent les apports de César des propositions de l'agent :

- **`[CG-FIXE]`** — décision arrêtée, à appliquer sans la rediscuter.
- **`[CG-IDÉE]`** — intuition à challenger : le dire si ça casse quelque chose.
- **`[CG-?]`** — question ouverte, à trancher **avant** d'écrire du code.

Tout ce qui n'est pas marqué est une proposition de l'agent dérivée des conventions du repo — donc négociable.

---

- **Type (slug)** : `natinotes` — utilisé comme `type` racine Firestore, nom du composant frontend et du form backend.
- **Nom affiché / pitch** : permet au lecteur de noter chaque joueur d'un match et de comparer sa note avec celle de la communauté. La liste est définie par le journaliste dans le backend.
- **Marques cibles** : `blick` uniquement.
  > **`[CG-FIXE]`** Pas de `pme` pour ce widget. Le sélecteur de brand du formulaire suit le pattern de `PotmForm.jsx` : radio `blick` coché, radio `pme` désactivé avec un `title` explicatif.

---

## 1. Modèle de données Firestore (4 blocs)

> Collection `widgets`. **Interdit** d'ajouter des propriétés à la racine hors `type` / `meta` / `stats` / `data`.

### `data` (config métier saisie dans le backend)

| Champ | Type | Description | Obligatoire |
|-------|------|-------------|-------------|
| `title` | string | Titre du widget | oui |
| `label` | string | Contexte du match, ex. « Suisse – France, 3-1 » | oui |
| `sport` | string | `football` \| `hockey` | oui |
| `category` | string | `Messieurs` \| `Dames` | oui |
| `players` | array | Joueurs sélectionnés, **dans l'ordre d'affichage** | oui (min. 1) |

> **`[CG-FIXE]`** Le contexte textuel du match se limite à `label` + `title` pour cette première version. Pas de date, pas de compétition, pas de score structuré.

> **`[CG-FIXE]`** En revanche `sport` et `category` sont prévus **dès maintenant** : le premier jet ne concerne que les sélections suisses, mais en **football et hockey**, **messieurs et dames**. Ces deux champs servent à filtrer le catalogue de joueurs dans le formulaire ; les ajouter après coup imposerait de retoucher `players.json` et les documents déjà créés.

> **`[CG-FIXE]`** L'**équipe n'est pas affichée** côté client dans cette version. Le lecteur sait que le widget note l'équipe de Suisse. `team` reste au modèle pour le jour où le widget s'ouvrirait à d'autres sélections.

**Forme d'un item de `players`** — instantané figé à la validation :

```json
{
  "id": "denis-zakaria",
  "name": "Denis Zakaria",
  "team": "Suisse",
  "img": null,
  "blickRating": 5,
  "comment": "<p>Il avait un énorme client face à lui avec Luis Diaz…</p>"
}
```

- `id` — identifiant unique **dans le widget**, sert de clé dans `stats`. Recopié tel quel depuis `players.json`. Le formulaire **désactive un joueur déjà choisi** dans les autres blocs, ce qui garantit l'unicité.
- `blickRating` — **la note de la rédaction**, entier de 1 à 6, saisi par le journaliste. Obligatoire. Affiché en badge rouge « Blick » face à la note communautaire (cf. maquettes).
- `comment` — le paragraphe rédigé par le journaliste, **stocké en HTML** (rich text). Obligatoire.
- `name`, `team`, `img` — **recopiés** depuis le catalogue au moment de la validation, jamais lus au runtime par l'app cliente. `img` vaut `null` dans cette version : aucun portrait n'est géré, l'app cliente affiche systématiquement la silhouette anonyme.

> **`[CG-FIXE]`** `comment` et `blickRating` sont **obligatoires** : le formulaire ne peut pas être validé avec l'un des deux vide.

> ⚠️ **`team` n'apparaît sur aucune des deux maquettes.** Les cartes affichent portrait + nom + paragraphe, sans mention d'équipe. Le champ reste au modèle (utile au catalogue et à l'ouverture future hors Nati), mais son affichage côté client est à confirmer — voir §5.

> **Pourquoi figer.** Même pattern que `PotmForm.jsx`, qui recopie `code`/`color`/`img` depuis `teams.json` dans chaque joueur avant l'envoi Firestore. Un widget publié reste ainsi fidèle à ce qui était vrai le jour du match, même si le catalogue évolue ensuite. C'est ce qui **décorrèle la création de widget de la gestion des données de référence**.

### `stats` (compteurs alimentés par les end-users)

| Champ | Type | Alimenté par | Mapping |
|-------|------|--------------|---------|
| `views` | number | vue de l'iframe | — (commun à tous) |
| `playerRatings` | objet | note envoyée par un lecteur | **par `id` de joueur**, puis par valeur de note |

```json
"stats": {
  "views": 1204,
  "playerRatings": {
    "breel-embolo": { "4": 12, "5": 40, "6": 8 },
    "yann-sommer":  { "3": 5,  "4": 22 }
  }
}
```

> **`[CG-FIXE]`** Chaque joueur sélectionné dispose de sa **distribution complète** de notes, pas seulement d'une somme. Structure calquée sur `stats.ratingStats`, déjà géré par `updateRatingStatsTransactional` (`packages/services/api.js:162`).

- Les clés absentes valent zéro — inutile d'initialiser les 6 valeurs à la création du widget.
- Moyenne calculée **côté client** : `Σ(note × occurrences) / Σ(occurrences)`.
- Un joueur sans aucune note n'a pas d'entrée dans `playerRatings` : l'app cliente doit gérer ce cas (affichage « pas encore de note »).

### Métrique de performance (« Inter. » backend / rapports n8n)

- **Champ résumant la perf** : nombre total de notes envoyées, soit la somme de toutes les occurrences de `stats.playerRatings`, tous joueurs confondus.

---

## 2. App cliente (`apps/natinotes/`)

- **Param d'URL** : `?natinotesDoc=<firestoreId>` (+ `#theme=dark`, géré par `base.css`). Pas de `&brand=`.

### Flow utilisateur

1. **Chargement** → `fetchWidgetData(docId, 'widgets')`, puis `incrementCounterViews` et `dataLayerPushView(docId, 'NATINOTES')`.
2. **En-tête** : `title` et `label` (contexte du match).
3. **Barème**, affiché une seule fois **en tête**, avant le premier joueur. Il défile avec le contenu — **rien de fixe**, pas de barre collante :

   > **`[CG-FIXE]`** 6 excellent · 5 bon · 4 acceptable · 3 mauvais · 2 très mauvais · 1 catastrophique
   >
   > (le screenshot `specs/bareme.png` écrit « catastophique » — coquille, on retient **catastrophique**)

4. **Pour chaque joueur**, dans l'ordre de `data.players`, une carte (cf. `specs/playercard-avant-vote.png` et `specs/playercard-apres-vote.png`).

> **`[CG-FIXE]`** Chaque joueur se note **indépendamment**, avec une écriture Firestore à chaque note. Le lecteur peut donc noter un seul joueur, voir immédiatement comment il se situe par rapport à la communauté, et repartir sans avoir répondu sur les autres. Pas de bouton de validation globale.

> **`[CG-FIXE]`** Aucun plafond au nombre de joueurs. Si le backend en sélectionne 20, l'app cliente en affiche 20 ; s'il n'en sélectionne qu'un, le lecteur n'en note qu'un.

### La carte joueur

Structure commune aux deux états : **portrait circulaire cerclé de rouge** à gauche, **nom en gras souligné de rouge**, puis le **paragraphe** du journaliste (HTML rich text) sur toute la largeur.

> **`[CG-FIXE]`** Dans cette version, le portrait affiché est **toujours la silhouette anonyme** (`anonymous`, livrée dans le bundle de l'app). `img` vaut `null` partout. Le code lit néanmoins `img` et ne retombe sur la silhouette que s'il est absent : le jour où le catalogue portera de vraies URL, rien à changer côté client.

**Avant vote** (`playercard-avant-vote.png`)

- À droite du nom : le label `Note` en rouge + le **badge rouge circulaire** portant `blickRating`.
- Sous le paragraphe, centré : l'invite **« Donnez une note à `<prénom nom>` ! »** en gris.
- En dessous : les **6 pastilles grises cliquables**, ordonnées **de 6 à 1** (décroissant, l'excellence à gauche).

**Après vote** (`playercard-apres-vote.png`)

- Le badge `Note` **disparaît** d'à côté du nom — la note Blick migre dans la rangée de résultats.
- L'invite et les 6 pastilles sont remplacées par, centré : le **nombre total de votes** de ce joueur (« 1323 votes »), en gris.
- En dessous, une rangée de trois couples label + badge :

  | Label | Badge | Valeur |
  |---|---|---|
  | `Communauté` (vert) | vert, arrondi | moyenne, **1 décimale** (`5.1`) |
  | `Blick` (rouge) | rouge, circulaire | `blickRating` (entier) |
  | `Vous` (gris) | gris, circulaire | la note du lecteur (entier) |

> **`[CG-FIXE]`** Le nombre de votants n'est affiché **qu'après le vote**. Il est absent de l'état initial.

- **Moyenne communautaire** : arrondie à **une décimale**. Le badge est plus large que les autres (valeur à 3 caractères).
- **Total des votes** de ce joueur : `Σ` des occurrences de `stats.playerRatings[playerId]`.
- **Joueur sans aucune note** : ne se produit jamais dans cet état, puisque le lecteur vient d'en déposer une — sa propre note est comptée dans le total et la moyenne.
- **Couleurs** : vert / rouge / gris à prendre dans les **variables du design system**, jamais en dur, pour que `#theme=dark` suive.

### Écriture Firestore

- Nouveau helper à créer dans `packages/services/api.js` :

  ```js
  updatePlayerRatingTransactional(docId, playerId, ratingValue, collectionName = 'widgets')
  ```

- Calqué sur `updateRatingStatsTransactional` (`api.js:162`) : `runTransaction` → relecture de `stats.playerRatings` → incrément de `[playerId][ratingValue]` → `transaction.update`.
- Écriture ciblée sur `stats.playerRatings` uniquement, pour que deux lecteurs notant deux joueurs différents ne se marchent pas dessus.

### Anti-rejeu

- Une clé `localStorage` **par joueur** : `hasRated_<docId>_<playerId>`, contenant la note donnée (pour pouvoir la réafficher au retour du lecteur).
- Flag `isDev` dans le composant pour désactiver le verrou en développement, comme les autres apps.

> **`[CG-FIXE]`** La note du lecteur est **définitive**. Aucun retour en arrière depuis l'état « après vote », aucune modification possible. L'état « après vote » n'expose donc aucune action.

### États d'affichage

Par joueur : chargement · **avant vote** · **après vote** · déjà noté lors d'une visite précédente (état « après vote », la note du lecteur étant relue depuis `localStorage`).

> Les deux cartes doivent avoir des **hauteurs proches** : le passage avant → après ne doit pas faire sauter la page sous le doigt du lecteur, d'autant que les cartes s'enchaînent verticalement et que l'iframe se redimensionne (`iframeHeightAdjustment.js`).

**Fraîcheur des chiffres après vote** : la moyenne et le total affichés doivent inclure la note que le lecteur vient de déposer. Deux voies — faire renvoyer par `updatePlayerRatingTransactional` la distribution mise à jour (préférable, une seule aller-retour), ou recalculer localement en ajoutant +1 à la clé votée sur la distribution déjà en mémoire.

### Technique

- **Boilerplate `index.html`** : init `window.blickDataLayer` en premier dans le `<head>`, `base.css` CDN, `iframeHeightAdjustment.js`.
- **Styling** : **Tailwind v4** (`src/tailwind.css` + plugin `@tailwindcss/vite`, cf. `testimony`/`prono`). Pas de SCSS. Couleurs issues des variables du design system, jamais en dur, pour que `#theme=dark` fonctionne.

---

## 3. Formulaire backend (`apps/backend/src/components/Form/NatinotesForm.jsx`)

> **`[CG-FIXE]`** **Formulaire allégé.** Les 4 champs d'en-tête (Sport, Catégorie, Titre, Label du match) sont ramenés à **2** : un select **Contexte** et le **Titre**.
>
> - **Contexte** — un seul menu : *Football équipe M · Football équipe F · Hockey équipe M · Hockey équipe F*. Le journaliste fait un geste au lieu de deux pour une décision unique, et les combinaisons sans catalogue ne sont plus atteignables.
>   - ⚠️ **`data.sport` et `data.category` restent stockés séparément.** Le select n'est qu'une commodité d'UI qui pilote les deux states — aucune migration, et ajouter un sport ne coûte qu'une ligne dans `CONTEXTS`. Ne pas « simplifier » en stockant la valeur composite `football|Messieurs`.
> - **Titre** — conservé, seul champ libre. Il n'est **pas affiché côté lecteur** : il alimente `meta.title` via `generateUnifiedTitle`, donc c'est le nom sous lequel le widget apparaît dans la liste du dashboard (`ListItem.jsx`). Le supprimer ferait apparaître tous les natinotes en « Sans titre », impossibles à distinguer.
> - **Label du match** — **retiré du formulaire**, plus obligatoire à la validation. Le champ n'était plus rendu côté client. `data.label` continue d'exister et la valeur des widgets déjà publiés est préservée à la ré-édition ; seule la saisie disparaît.

### Champs

| Champ | Contrôle |
|-------|----------|
| Brand | radio `blick` / `pme` désactivé |
| Rubrique (`theme`) | select, comme `PotmForm` |
| Sport | select `football` / `hockey` |
| Catégorie | select `Messieurs` / `Dames` |
| Titre | input texte |
| Label du match | input texte |
| Joueurs | liste répétable |

> Le couple **sport + catégorie** filtre les suggestions de joueurs. Le changer alors que des joueurs sont déjà sélectionnés doit **avertir** plutôt que vider la liste — `PotmForm.handleContextChange` (ligne 70) réaffecte silencieusement les équipes devenues invalides, comportement à ne pas reproduire ici.

### Liste de joueurs

> **`[CG-FIXE]`** Le formulaire démarre avec **un seul** joueur. Le journaliste en ajoute via le lien « + Ajouter un joueur » sous le dernier élément. Les joueurs peuvent être **réordonnés et supprimés**.

- Réemploi direct de `RepeatableBlockActions.jsx` (monter / descendre / supprimer), déjà utilisé par `PotmForm`.
- Contrairement à `PotmForm` (minimum 2 candidats), le minimum ici est de **1** joueur. **Pas de maximum.**

**Contenu d'un bloc joueur**

| Champ | Contrôle | Obligatoire |
|---|---|---|
| Joueur | liste déroulante du catalogue figé | oui |
| Note Blick (`blickRating`) | sélection d'un entier de 1 à 6 | oui |
| Paragraphe (`comment`) | **`RichTextEditor.jsx`**, stocké en HTML | oui |

> **`[CG-FIXE]`** Le formulaire **ne peut pas être validé** tant qu'un `comment` ou un `blickRating` est vide, sur n'importe quel joueur de la liste.

- **Rendu côté client** : le HTML produit par `RichTextEditor` est injecté via `dangerouslySetInnerHTML`. La source est de confiance (rédaction authentifiée), mais restreindre les balises autorisées à celles réellement utiles au paragraphe (gras, italique, lien).

### Catalogue de joueurs

> **`[CG-FIXE]`** **Catalogue figé.** Le formulaire ne propose que les joueurs de `players.json` — pas de saisie libre, pas d'enrichissement automatique, pas d'upload de portrait. La flexibilité rendait le flux de création confus ; on la réintroduira une fois les deux apps fonctionnelles.

- Emplacement : `apps/backend/src/data/players.json`, à côté de `teams.json` et `contexts.json`.
- Forme d'une entrée :

  ```json
  {
    "id": "denis-zakaria",
    "name": "Denis Zakaria",
    "team": "Suisse",
    "sport": "football",
    "category": "Messieurs",
    "img": null
  }
  ```

- `id` — slug `prénom-nom`, **écrit explicitement** dans le JSON, jamais calculé à l'exécution. Sert de clé dans `stats.playerRatings`.
- `sport` et `category` — **filtrent** le catalogue selon le contexte choisi en tête de formulaire. Un widget « hockey / Dames » ne propose que les joueuses de hockey. Ces deux champs restent au catalogue et **ne sont pas recopiés** dans l'instantané, qui les porte déjà au niveau `data`.
- `img` — **`null` partout pour l'instant** (voir ci-dessous).
- **Périmètre** : on démarre avec les joueurs suisses, `team` reste un champ libre pour élargir sans migration.
- **Enrichissement** : par commit + redéploiement du backend. C'est assumé pour ce premier jet.
- **Conséquence dans le formulaire** : un joueur déjà choisi est désactivé dans les autres blocs, ce qui rend le doublon d'`id` structurellement impossible. Si le catalogue est vide pour le couple sport/catégorie retenu, le formulaire le signale explicitement.

#### Portraits : pas de portrait pour l'instant

> **`[CG-FIXE]`** Aucun portrait n'est géré dans cette version. `ImageUploader` n'est pas utilisé, le backend n'affiche pas d'image, et l'app cliente affiche **systématiquement la silhouette anonyme**.

- `img` vaut `null` pour tous les joueurs, au catalogue comme dans l'instantané du widget.
- L'app cliente lit `img` et retombe sur une image **livrée dans son bundle** (`apps/natinotes/src/assets/`). Le champ reste au modèle : le jour où des portraits existent, il suffit de renseigner les URL du catalogue, sans migration ni changement de code client.
- **Zéro octet** dans Firebase Storage, et pas de silhouette anonyme dupliquée en base — ce que l'exigence initiale demandait.

##### À reprendre quand les portraits arriveront

Références fournies dans `specs/portraits/` : `akanji.jpg`, `amdouni.jpg`, `rodriguez.jpg`, `anonymous.jpg` — toutes en **324×324**, entre 48 et 108 ko. Cible : **10 ko par portrait**, contre 50–100 ko pour les autres types de widgets.

**Mesures** (`akanji.jpg`, 100 ko d'origine, encodage JPEG) :

| Largeur | q70 | q60 | q50 |
|---|---|---|---|
| 324 px | 39 ko | 34 ko | 28 ko |
| 256 px | 22 ko | 20 ko | 17 ko |
| 200 px | 17 ko | 16 ko | 14 ko |
| 160 px | 14 ko | 13 ko | 11 ko |

**Baisser la qualité ne suffit pas** : à 324 px, même en q50, on reste à 28 ko. Il faut réduire les dimensions. Le WebP (~30 % de mieux que JPEG, déjà utilisé par `ImageUploader`) rend la cible atteignable autour de **200–256 px** — net pour un avatar circulaire affiché à ~100 px, même en écran 2×.

Si l'upload revient un jour dans le formulaire, `ImageUploader.jsx` devra rendre **les deux** paramètres contextuels au type (aujourd'hui codés en dur, l. 82-93 : `maxSizeMB: 0.075`, `maxWidthOrHeight: 1928`), sans toucher au comportement des autres types. Noter aussi que le chemin se construit en `${type}s/` — passer `type="natinote"` pour obtenir `natinotes/`.

#### Identité d'un joueur

L'identité, c'est l'**`id`** de `players.json`. Il est **écrit en dur dans le catalogue**, jamais calculé à l'exécution : le formulaire ne fait que le recopier dans l'instantané du widget.

Convention de rédaction du catalogue : slug `prénom-nom`, minuscules, accents dépouillés.

```
"Breel Embolo"      → "breel-embolo"
"Ricardo Rodríguez" → "ricardo-rodriguez"
```

**Règle non négociable : l'`id` d'un joueur ne change jamais.** C'est la clé de `stats.playerRatings`. Corriger le `name` d'une entrée du catalogue est sans danger — les widgets publiés portent leur propre instantané et gardent leur `id`. Renommer un `id`, en revanche, orphelinerait toutes les notes déjà collectées sous l'ancienne clé.

> Le catalogue étant figé et l'`id` jamais dérivé d'une saisie, le risque de variante d'écriture (`"X. Shaqiri"` vs `"Xherdan Shaqiri"`) disparaît de ce premier jet. Il reviendra le jour où la saisie libre sera réintroduite — prévoir alors un avertissement de similarité.

> **Note d'architecture.** La séparation reste délibérée : le formulaire crée un **widget**, il ne gère pas de **données de référence**. Le jour où la curation manuelle deviendra pénible, la bascule vers une collection Firestore `players` avec son propre écran d'administration se fera **sans toucher aux widgets déjà publiés**, puisque ceux-ci figent leur instantané. La couche `api.js` est déjà paramétrée par nom de collection, et l'auth comme l'upload existent — le vrai coût est produit (qui a le droit d'éditer le référentiel ?), pas technique.

### Adaptateur — et surface réelle d'intégration

⚠️ **Le backend n'a pas de registre de types de widgets.** L'ajout d'un type se fait par une **chaîne de branches `if/else`** dispersée dans plusieurs fichiers. Créer `NatinotesForm.jsx` ne représente qu'une partie du travail.

| Fichier | Ce qu'il faut toucher |
|---|---|
| `Form.jsx` (1633 lignes) | **12 emplacements**, sur le modèle de `potm` : import du composant, titre de création (l. 70), titre d'édition (l. 81), aplatissement `getLegacyEmbed` (l. 42), branches de transformation (l. 729, 803), sauvegarde création (l. 1080, 1208), messages de succès (l. 1264, 1472), sauvegarde édition (l. 1364), rendu conditionnel (l. 1578) |
| `App.jsx` | entrée du type dans le menu « nouveau widget » |
| `ListItem.jsx` | rendu de la ligne dans la liste du dashboard |

> Repérer les occurrences avec `grep -n "potm" Form.jsx` : chaque branche `potm` a son équivalent à créer pour `natinotes`.

- `getLegacyEmbed` : 4 blocs → modèle plat pour le form.
- `transformWidgetData` : form → 4 blocs avant envoi Firestore. **`title`, `label`, `sport`, `category` et `players` vont dans `data`**, jamais dans `meta`.
- **Sauvegarde** : `runTransaction` qui **relit `stats` existants et les merge**. Ne jamais réinjecter les notes dans `data` — à l'inverse de `PotmForm`, qui porte encore un `votes: 0` dans ses items (héritage `embeds`, ne pas reproduire ici).

#### Suppression d'un joueur dans un widget publié

> **`[CG-FIXE]`** Si un joueur est retiré de la liste, sa distribution dans `stats.playerRatings` doit être supprimée également. Pas de données orphelines.

- Le merge des `stats` à la sauvegarde **filtre** `playerRatings` sur les `id` encore présents dans `data.players`, via `deleteField()` sur les clés retirées (déjà importé dans `api.js:2`).
- ⚠️ **Opération irréversible** : les notes collectées sont définitivement perdues. Le formulaire doit demander une confirmation explicite à la suppression d'un joueur ayant déjà des notes, en indiquant le nombre de notes concernées.
- La suppression n'a lieu qu'à la **sauvegarde** du widget, pas au clic sur « supprimer » — retirer un joueur puis quitter sans enregistrer ne doit rien détruire.

### Intégration dashboard

- Icône `icon-natinotes.svg` + entrée dans le menu « nouveau widget ».

---

## 4. Sécurité & déploiement

- **Firestore rules** : autoriser l'écriture publique sur `stats.playerRatings` (cf. `security-rules-prod.md`), au même titre que les autres compteurs alimentés par les lecteurs.
  - Sans cette clause, **tous les votes sont refusés en production** : la règle anonyme fonctionne par liste blanche de clés de `stats`, une clé absente n'est pas permissive par défaut.
  - Contrainte posée : seul `stats.playerRatings` change, et **un seul joueur par écriture** — ce que produit `updatePlayerRatingTransactional`.
  - Limite assumée : les clés joueur sont dynamiques et les règles Firestore ne bouclent pas (`changedKeys()` renvoie un `Set` non indexable), donc la distribution elle-même n'est pas validée. Un lecteur déterminé peut fausser la distribution d'**un** joueur, pas en toucher un autre ni sortir de `stats`. Même niveau de garantie que `answerCounters` (poll) ou `itemVotes` (prono).
  - ⚠️ `security-rules-prod.md` est un **reflet** de ce qui est déployé dans la console Firebase, pas la source active. Modifier le fichier ne change rien tant que les règles ne sont pas publiées côté Firebase — et l'inverse est vrai aussi.
- **Env** : vérifier que `.env` pointe la bonne base (`.env-test` vs `.env-prod`) avant tout build.
- **Déploiement** : dossier FTP cible `bl-tools-client-natinotes` (upload « in-place » du `dist/`).

---

## 5. Évolution envisagée — vue « classement »

> **`[CG-IDÉE]`** Une fois tous les joueurs notés, afficher un **classement en colonne** façon graphique, présentant les joueurs selon trois points de vue, avec **navigation par onglets** : *le journaliste* · *le lecteur* · *la communauté*.

**Bonne nouvelle : aucun impact sur le modèle de données.** Les trois classements se calculent intégralement à partir de ce qui existe déjà :

| Onglet | Source | Tri |
|---|---|---|
| Journaliste | `data.players[].blickRating` | note Blick décroissante |
| Vous | clés `localStorage` `hasRated_<docId>_<playerId>` | note du lecteur décroissante |
| Communauté | `stats.playerRatings` | moyenne décroissante |

Cette vue peut donc être **ajoutée après coup, sans migration** ni changement des documents déjà publiés. Rien n'oblige à la livrer avec le premier jet.

> **`[CG-FIXE]`** ~~Hors périmètre du premier jet.~~ **Implémenté** — `apps/natinotes/src/components/Classement.jsx`, monté en bas de `App.jsx` après la liste des cartes.

### Comportement de l'onglet « Vous »

> **`[CG-FIXE]`** L'onglet classe les joueurs **déjà notés par le lecteur**, du meilleur au moins bon. Les joueurs pas encore notés apparaissent **en bas de classement, grisés**. Si le lecteur n'a encore rien noté, le classement affiche quand même **tous** les joueurs, grisés et donc tous ex æquo.

Le classement est donc **toujours complet** : chaque joueur du widget y figure, noté ou non. L'onglet reste accessible en permanence, il n'attend pas que la grille soit remplie.

### Ex æquo

> **`[CG-FIXE]`** Pas un problème en pratique : la répartition des notes suffit habituellement à produire plusieurs niveaux distincts.

Départage par défaut en cas d'égalité : **l'ordre défini dans le backend** (`data.players`), qui reflète déjà un choix éditorial. Pas de tri alphabétique, pas de position partagée explicite.

### Forme retenue

> **`[CG-FIXE]`** **Barres horizontales** : une ligne par joueur — nom à gauche, barre proportionnelle à la note (`note / 6`), valeur au bout. Tient sur mobile étroit quel que soit le nombre de joueurs, contrairement aux colonnes verticales qui deviennent illisibles au-delà de 6-7.

> **`[CG-FIXE]`** **Accessible en permanence**, en bas de page, dès le chargement. C'est la seule option cohérente avec la règle « le classement affiche tous les joueurs même si le lecteur n'a rien noté » — cette règle n'a de sens que si la vue est atteignable avant tout vote. Évite aussi un saut de mise en page dans l'iframe.

> **`[CG-FIXE]`** **Transition animée** (300 ms) au changement d'onglet, avec respect de `prefers-reduced-motion`. C'est ce qui donne son sens à la comparaison : on voit un joueur monter chez la communauté et descendre chez le journaliste.

### Activation par le journaliste

> **`[CG-FIXE]`** Le bloc est **activable/désactivable** depuis le backend, via une case en fin de formulaire. **Activé par défaut.**

- Champ : **`data.showRecap`** (booléen). Sa place est dans `data` — c'est un réglage métier, pas un compteur.
- Le titre affiché côté client est **« Récap des avis »**, pas « Classement ».
- Décocher masque le bloc mais **ne change rien à la collecte** : les notes continuent d'alimenter `stats.playerRatings`, et réactiver le récap fait réapparaître l'historique complet.
- **Compatibilité ascendante** : les documents publiés avant l'ajout du réglage n'ont pas le champ. Partout, le test est `showRecap !== false` (et `?? true` dans `getLegacyEmbed`) — un champ absent vaut donc « activé », jamais « désactivé ». Ne pas remplacer ces tests par un `if (showRecap)` truthy, qui masquerait le récap sur tout l'existant.

### Notes d'implémentation

- **Onglets** : `Blick` · `Vous` · `Communauté`, dans l'ordre de la spec. **Défaut : `Blick`** — c'est le seul point de vue toujours renseigné (`blickRating` est obligatoire au formulaire), donc le seul qui ne s'ouvre jamais sur un classement entièrement grisé.
- **Réordonnancement animé** : l'ordre du DOM ne change jamais (il suit `data.players`) ; c'est le `transform: translateY(rang × hauteur)` de chaque ligne qui change. Les nœuds ne sont ni démontés ni remontés, d'où une animation fluide sans FLIP ni bibliothèque.
- **Source de l'onglet « Vous »** : le state React `readerRatings`, **pas** `localStorage` directement. Les deux coïncident en production, mais `isDev` court-circuite `localStorage` — lire le state garde le classement cohérent avec les cartes en développement.
- **Joueur sans note** : barre à 0 %, valeur `—`, ligne à `opacity: 0.45`, rejeté en bas de classement. Concerne l'onglet « Vous » (pas encore voté) et l'onglet « Communauté » (aucune note collectée). Jamais l'onglet « Blick ».
- **Couleurs** : les mêmes variables que les pastilles des cartes — `--natinotes-brand` (Blick), `--natinotes-neutral` (Vous), `--natinotes-community` (Communauté). Le darkmode suit sans code supplémentaire.

---

## 6. Gestion des équipes (collection `teams`)

> **`[CG-FIXE]`** Le catalogue devient **éditable depuis le backend**. `players.json` disparaît au profit d'une collection Firestore dédiée, **un document par équipe**.

### Pourquoi c'est sans danger pour les widgets publiés

Le **pattern snapshot** l'autorise : un widget fige `name` / `team` / `img` dans `data.players` au moment de la validation. Le catalogue n'est qu'une **aide à la saisie**, jamais une dépendance à l'exécution — l'app cliente ne lit jamais `teams`. Éditer une équipe ne peut donc ni altérer un widget publié, ni casser le rendu lecteur.

### Structure du document

⚠️ **La règle des 4 blocs ne s'applique pas ici** : elle vaut pour la collection `widgets`, pas pour tout le projet. Un document `teams` n'est pas un widget.

```
teams/suisse-m-football        ← id : slug du nom
{
  "name": "Suisse M – Football",
  "players": [ { "id", "name", "team", "img", "archived" } ],
  "timeUpdated": <serverTimestamp>
}
```

> **`[CG-FIXE]`** **Les équipes sont créées à la main, à la demande.** Pas de liste de nations pré-remplie : le jour où il faut noter l'équipe de France, le journaliste crée l'équipe, la nomme, y met ses joueurs. Seules les équipes réellement utiles existent.

> **`[CG-FIXE]`** **Une équipe n'est qu'un nom.** Ni sport ni genre ne sont saisis : c'est au journaliste de donner un nom sans ambiguïté (« Suisse M – Football »). Le nom est le seul critère de distinction, et la clé du document.

- **Conséquence : `data.sport` et `data.category` disparaissent du widget.** Plus rien ne les alimente. Ils ne sont plus écrits ni lus ; les documents déjà publiés les conservent sans effet. Le contexte d'un widget se lit désormais dans le `team` figé de ses joueurs.
### Le contexte vit au niveau du joueur

> **`[CG-FIXE]`** **Un widget peut mélanger plusieurs effectifs.** Le sélecteur d'effectif n'est plus en tête de formulaire : il est **sur la ligne de chaque joueur**, aux côtés de « Joueur » et « Note Blick ». Chaque bloc puise donc dans l'effectif qu'on lui désigne, ce qui permet de noter des joueurs de deux sélections dans une même liste.

- **Un nouveau bloc hérite de l'effectif du précédent**, si bien que la liste des joueurs proposés est déjà cadrée. Sur vingt joueurs dont dix-huit d'une même équipe, on ne touche l'effectif que deux fois.
- **Changer l'effectif d'un bloc vide sa seule sélection de joueur** — note Blick et paragraphe sont conservés, ils décrivent la ligne. Plus aucune réinitialisation globale de la liste.
- **`teamId` est un champ de travail du formulaire, jamais enregistré.** Le widget ne garde que le nom d'équipe (`team`), figé dans l'instantané comme le reste. À la ré-édition, chaque bloc retrouve son effectif par ce nom.
- **Un seul chargement Firestore** : `fetchAllTeams` renvoie les documents complets, joueurs compris. Aucun appel supplémentaire quel que soit le nombre d'effectifs mélangés.
- **L'unicité des identifiants reste vérifiée sur tout le widget**, effectifs confondus : deux homonymes venus de deux sélections produiraient le même identifiant, donc une distribution de notes partagée entre deux joueurs.

⚠️ **Conséquence côté lecteur, non encore traitée** : dès qu'une liste mélange deux équipes, ne pas afficher l'équipe rend le widget ambigu — on ne sait plus qui joue dans quel camp, ni dans les cartes ni dans le récap. Le `[CG-FIXE]` « n'affichons pas l'équipe pour le moment » est à rouvrir.

### Présentation

> **`[CG-FIXE]`** L'écran d'édition des équipes reprend la présentation du formulaire de widget : même largeur (`max-w-4xl`), même position centrée, même hauteur maximale (`80vh`), en-tête gris avec titre et croix de fermeture, pied de page à deux boutons « Annuler » / « Sauvegarder », et le même `BlackOverlay` pour bloquer la page. Les deux écrans doivent se ressembler.

### Décisions arrêtées

- **`[CG-FIXE]` L'`id` est définitif.** Corriger une faute dans un nom ne le recalcule **jamais**. L'`id` est la clé de `stats.playerRatings` dans tous les widgets déjà publiés : le changer orphelinerait les notes collectées, que la purge supprimerait ensuite. L'`id` n'est généré qu'à la **création** d'un joueur, puis figé à vie. Prévoir le cas des homonymes (suffixe manuel).
- **`[CG-FIXE]` Joueurs du widget absents du catalogue : injectés dans les options.** À la ré-édition d'un widget dont un joueur a quitté l'équipe, ce joueur reste sélectionnable et conserve son nom et ses statistiques. Sans cette injection, le `<select>` s'afficherait vide et une sauvegarde ferait disparaître le joueur — **et la purge des orphelins supprimerait définitivement ses notes**.
  - Cas jugé rare, et la disparition du joueur serait acceptable *en soi* ; c'est la perte silencieuse des autres données qui ne l'est pas.
- **`[CG-FIXE]` Écriture en `runTransaction`.** Un document par équipe signifie que chaque enregistrement réécrit tout le tableau : deux journalistes éditant simultanément, le dernier écraserait l'autre. Cas rare, mitigation peu coûteuse.
- **`[CG-FIXE]` Amorçage par import one-shot.** Un bouton « Importer le catalogue initial », visible tant que l'équipe est vide, copie les joueurs de `players.json` vers Firestore. Ensuite **le formulaire ne lit plus que Firestore**.
  - ⚠️ **`players.json` reste dans le repo jusqu'à ce que l'import ait été fait sur les deux bases.** Test et production sont deux projets Firebase distincts : la collection `teams` de prod sera vide elle aussi le jour du déploiement, et l'import devra y être rejoué. Supprimer le fichier après l'import en test priverait la prod de son amorçage.
  - L'opération est à faire **par équipe** (4 documents), sur chaque base. Le fichier n'est supprimable qu'une fois les 4 équipes de production constituées.
  - ⚠️ **Pas de fallback « si la collection est vide, lire le JSON ».** Deux sources de vérité divergent toujours — c'est ce mécanisme qui a produit les `stats.tinderVotes || data.tinderVotes` de `api.js`. Une seule autorité dès le premier jour.
- **`[CG-FIXE]` Accessible aussi depuis le dashboard**, pas seulement depuis le formulaire. Gérer un effectif est une tâche en soi ; n'y accéder qu'en passant par « créer un widget » entretiendrait la confusion entre création de contenu et gestion de données de référence.

### Sécurité

Le catch-all `allow read, write: if false` bloque toute collection non déclarée : sans règle explicite, l'écran ne fonctionnera pas en production. `teams` est réservée aux utilisateurs **authentifiés**, en lecture comme en écriture — contrairement à `widgets`, aucun accès anonyme n'est nécessaire puisque l'app cliente ne lit jamais cette collection. Voir `security-rules-prod.md`.

---

## 7. Ouvertes / à valider

- Rien en suspens sur le périmètre du premier jet — les 3 faces sont spécifiées.

### Nommage : slug d'identité ≠ nom de fichier

> **`[CG-FIXE]`** Le slug d'identité est **`prénom-nom`** (`manuel-akanji`). Les noms de fichiers des portraits restent **libres** — les fichiers fournis dans `specs/portraits/` utilisent le patronyme seul (`akanji.jpg`), c'est sans conséquence.

Les deux n'ont pas besoin de coïncider : `players.json` porte une **URL complète**, il n'y a donc aucune reconstruction de chemin depuis le slug.

Le slug étant la clé de `stats.playerRatings`, il est **définitif dès la première publication**. On prend donc la forme qui ne collisionne pas : `rodriguez` seul devient ambigu dès qu'on couvre quatre effectifs (foot/hockey × Messieurs/Dames), `ricardo-rodriguez` non.
