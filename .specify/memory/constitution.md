<!--
Sync Impact Report
- Version change: template → 1.0.0 (première ratification)
- Principes : I. Modèle Firestore 4 blocs · II. Compteurs par id dans `stats` ·
  III. Une seule fabrique de documents · IV. Moindre privilège, environnements séparés ·
  V. Simplicité et héritage assumé
- Sections ajoutées : Contraintes techniques, Workflow de développement, Governance
- Sections supprimées : aucune
- Templates : plan-template.md / spec-template.md / tasks-template.md compatibles, non modifiés
- TODO différés : aucun
-->

# Blick Tools Constitution

## Core Principles

### I. Modèle Firestore 4 blocs (NON NÉGOCIABLE)

Tout document de la collection `widgets` a exactement quatre propriétés racine : `type`
(string), `meta`, `stats`, `data`. Aucun autre champ racine n'est écrit, quel que soit
l'écrivain (admin, API, script de migration).

- `meta` porte uniquement `id`, `brand`, `theme`, `author`, `deleted`, `timeCreated`,
  `timeUpdated`, `title` (et `label` si le type l'exige).
- Les textes métier (`title`, `label`, `question`…) vivent dans `data`.
- Les fallbacks legacy (`embeds`, structure plate) de `packages/services/api.js` restent tant
  qu'un document ancien peut subsister.

Rationale : les apps clientes, le dashboard et les rapports n8n lisent ces chemins en dur.

### II. Compteurs par id, dans `stats`

Les compteurs alimentés par les lecteurs vivent exclusivement dans `stats`. Toute liste
réordonnable recevant des votes/clics porte un `id` unique par élément, et ses compteurs sont
mappés par cet `id`, jamais par index. Toute réécriture d'un widget à compteurs relit les
`stats` existants et les fusionne (`runTransaction`).

Rationale : un réordonnancement ou une édition ne doit jamais déplacer ni effacer des votes.

### III. Une seule fabrique de documents

La validation métier et la construction d'un document `widgets` (passage formulaire → 4 blocs)
existent en un seul exemplaire, dans un package partagé sans dépendance Firebase, consommé par
tous les écrivains (dashboard `apps/backend`, API serveur). Un écrivain n'a le droit de
recoder ni une règle de validation ni le mapping d'un champ ; il fournit seulement ce qui lui
est propre (horodatage serveur, identité de l'auteur, génération d'id).

Rationale : deux écrivains qui divergent produisent des documents que l'un des lecteurs ne
sait pas afficher ou compter.

### IV. Moindre privilège, environnements séparés

- Chaque usage machine a son propre compte de service, avec le rôle minimal
  (lecture : *Cloud Datastore Viewer* ; écriture : *Cloud Datastore User*). Le compte
  `firebase-adminsdk-*` n'est jamais utilisé par un service.
- Les accès serveur à serveur s'authentifient sans secret partagé quand l'infrastructure le
  permet (jetons OIDC Google) et filtrent l'appelant sur une liste blanche explicite.
- Test (`blick-tools-app`) et production (`blick-tools-app-42a99`) sont deux déploiements
  distincts ; aucune configuration ne retombe silencieusement sur la production.
- Aucun secret, clé ou `.env` n'est versionné.

Rationale : un compte de service contourne les règles Firestore ; seul l'IAM le borne.

### V. Simplicité et héritage assumé

On choisit la solution la plus ennuyeuse qui marche : dépendances minimales, pas
d'abstraction sans second consommateur réel. Le nouveau code front suit Tailwind v4 + CSS
standard à variables du design system (pas de SCSS). Une extraction de code commun procède
par type « cobaye » (le premier type migré prouve le pattern avant généralisation), en
coupure nette : l'ancien chemin est supprimé, pas dupliqué.

## Contraintes techniques

- Monorepo npm workspaces (`apps/*`, `packages/*`), Node ≥ 22 côté serveur, ESM partout.
- Apps clientes : Vite + React 19, `base: "./"`, `envDir: '../../'`, boilerplate
  `index.html` (dataLayer, `base.css` CDN, `iframeHeightAdjustment.js`).
- Identification d'un widget par `?<type>Doc=<id>` ; URL d'embed construite par une seule
  fonction partagée.
- Services serveur : conteneur Cloud Run dans le projet GCP de l'environnement visé,
  configuration exclusivement par variables d'environnement validées au démarrage.

## Workflow de développement

- Toute fonctionnalité transverse (nouvelle API, nouveau type, extraction partagée) suit
  Spec Kit : `spec.md` → `plan.md` (+ `research.md`, `data-model.md`, `contracts/`,
  `quickstart.md`) → `tasks.md` → implémentation, dans `specs/NNN-<nom>/`.
- Avant tout build ou écriture Firestore : vérifier quel `.env` est actif.
- Les 11 apps à `.git` imbriqué se committent dans leur propre dépôt ; vérifier le dépôt
  avant de committer.
- Packages partagés et services serveur : tests `node --test` sur les comportements
  observables (documents produits, codes HTTP) ; apps front : lint + smoke manuel.

## Governance

Cette constitution prime sur les conventions implicites. Un plan qui la viole doit le
justifier dans sa section *Complexity Tracking*, sinon il est refusé. Amendement : modifier ce
fichier, incrémenter la version (MAJOR : principe retiré/redéfini ; MINOR : principe ou
section ajouté ; PATCH : formulation), dater, et répercuter dans `CLAUDE.md`. Le guide
d'exécution quotidien reste `CLAUDE.md` ; le détail du modèle de données reste
`widget_structure_guide.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
