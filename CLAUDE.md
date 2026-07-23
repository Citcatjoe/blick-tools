# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vue d'ensemble

Monorepo **npm workspaces** regroupant les widgets « clients » de Blick (sondage, calendrier, quiz, tinder…), un backend d'administration, et des packages partagés. Chaque widget est une app **Vite + React 19** indépendante qui se build en iframe légère embarquée dans les pages éditoriales. Le backend est le dashboard qui crée/édite ces widgets. Toutes les données transitent par **Firestore** (collection `widgets`).

## Commandes

Tout se lance depuis la racine (les dépendances et les liens de packages locaux sont gérés par les workspaces) :

```bash
npm install                 # à la racine — installe tout et lie @rms/ui, @rms/services
npm run dev:<app>           # dev server Vite (ex: dev:poll, dev:backend, dev:quiz)
npm run build:<app>         # build de production → apps/<app>/dist
```

Apps disponibles : `poll`, `calendar`, `folder`, `teaser`, `facts`, `potm`, `prono`, `quiz`, `testimony`, `tinder`, `backend`, plus `docs` et `utils`.

Lint (par app, pas de script agrégé à la racine) :

```bash
npm run lint -w apps/<app>   # eslint . — présent dans toutes les apps sauf `docs`
```

Il n'y a **pas de suite de tests** dans ce dépôt (aucun script `test` dans aucune app).

## Structure du dépôt

- `packages/services` (`@rms/services`) — code partagé Firebase / API / analytics. Point d'entrée `index.js` ré-exporte `firebase.js`, `api.js`, `analytics.js`. **La plupart des accès Firestore passent par ici.**
- `packages/ui` (`@rms/ui`) — package des **composants partagés à terme**. Le monorepo est né de la fusion de plusieurs repos séparés ; avec la multiplication des apps clientes, l'objectif est d'y **homogénéiser les composants communs** plutôt que de les recoder dans chaque nouvelle app. **État actuel : vide** — seul un placeholder `WelcomeUI` existe, aucun composant réel n'a encore été extrait, et aucune app cliente ne l'importe (les composants vivent toujours en double dans chaque app).
- `legacy-redirects/` — anciens dossiers FTP `bl-tools-client-*` (cible du déploiement).
- `n8n_workflows/` — workflows externes de reporting analytique (Slack). Pas du code applicatif.

### Les apps de `/apps`

Toutes les apps sont des projets **Vite + React 19 indépendants**, mais elles ne jouent pas le même rôle. Bien distinguer :

- **`backend`** — l'application **« mère »** : le dashboard d'administration qui permet de **créer et éditer le contenu** consommé par les apps clientes (auth Firebase, CRUD Firestore, formulaires `Form/*.jsx`, `upload.php`). C'est le seul point d'entrée d'écriture « métier » ; les widgets clients ne font que lire ce contenu et incrémenter des compteurs.

- **Apps clientes** (les widgets embarqués en iframe) : `calendar`, `facts`, `folder`, `poll`, `potm`, `prono`, `quiz`, `teaser`, `testimony`, `tinder`. Chacune rend un type de widget créé depuis le `backend`, à partir d'un document Firestore identifié par l'URL de l'iframe.

- **`utils`** — application **utilitaire jetable**, codée à la va-vite pour exécuter les tâches de **migration** (dans le cadre de la refactorisation récente `embeds` → `widgets`). Son emplacement dans `/apps` n'est pas considéré comme pertinent à terme ; elle est là temporairement. Ne pas s'en inspirer comme modèle.

- **`docs`** — **vitrine des composants partagés** (type « storybook »). C'est la seule app qui importe `@rms/ui` : sidebar listant les composants + sélecteur de marque pour tester le theming. Elle a vocation à présenter les composants qui seront **extraits des apps clientes vers `packages/ui`**. Pour l'instant elle n'affiche que le placeholder `WelcomeUI` (aucun composant partagé n'existe encore). Ce n'est pas un widget client.

⚠️ **Sous-dépôts git imbriqués** : les **11 apps** (les 10 clientes + `backend`) contiennent chacune leur propre `.git` — héritage des repos séparés d'avant le monorepo. Ce ne sont pas de simples dossiers : un `git add` à la racine ne les suit pas comme du code normal. **Vérifier dans quel repo on se trouve avant de committer.** Seules `docs` et `utils` sont de vrais dossiers du repo racine (pas de `.git` propre).

## Modèle de données Firestore (la règle d'or)

Tout document de la collection `widgets` a **exactement 4 propriétés à la racine**, et jamais d'autres :

```json
{
  "type": "poll",          // seul champ primitif racine — pilote le composant à appliquer
  "meta":  { "id", "brand", "theme", "author", "deleted", "timeCreated", "timeUpdated", "title", "label" },
  "stats": { "views": 0, ... },  // UNIQUEMENT les compteurs (écritures atomiques des end-users)
  "data":  { ... }         // tout le métier : title, label, tableaux d'items, réglages…
}
```

Règles non négociables (voir `widget_structure_guide.md` pour le détail complet) :

- Les champs textuels globaux (`title`, `label`, `teaserTitle`…) vont dans **`data`**, jamais dans `meta`.
- Les compteurs vont **exclusivement dans `stats`**. Ne jamais les réinjecter dans `data`.
- Pour toute liste d'éléments réordonnables recevant des votes/clics (questions, réponses, cartes…), les compteurs sont **mappés par l'`id` unique de l'élément**, jamais par l'index du tableau. Les formulaires backend (`PollForm.jsx`, `FolderForm.jsx`…) doivent générer et conserver cet `id`.
- La mise à jour de widgets à compteurs alimentés par les users se fait via **`runTransaction`** (lecture des `stats` existants + merge), voir `packages/services/api.js`.

### Legacy : `embeds` → `widgets`

La collection historique s'appelait `embeds` (structure « à plat », hétérogène) ; une migration Blue/Green l'a copiée vers `widgets` (structure à 4 blocs). Le code de `packages/services/api.js` gère **encore les deux structures** (ancienne plate et nouvelle imbriquée) — d'où les fallbacks du type `stats.tinderVotes || data.tinderVotes`. Ne pas « simplifier » ces fallbacks sans vérifier qu'aucun document ancien ne subsiste.

Dans le backend (`apps/backend/src/components/Form/Form.jsx`), le pattern est un **Adaptateur** : `getLegacyEmbed` aplatit les 4 blocs pour le formulaire React, `transformWidgetData` re-package en 4 blocs avant l'envoi Firestore. Lors d'une édition, la priorité doit aller aux données du formulaire (`formData`), pas au `legacyEmbed`.

## Conventions des widgets (frontend)

> Pour **créer un nouveau widget**, partir de `SPEC_TEMPLATE.md` (racine) : il structure la spec en 3 faces indissociables — modèle Firestore 4 blocs, app cliente, formulaire backend.

- **Identification du widget** : chaque app cliente lit son document dans l'URL de l'iframe via le param **`?<type>Doc=<firestoreId>`** (`?pollDoc=abc`, `?quizDoc=xyz`, `?pronoDoc=…`). C'est le seul param universel — les 10 apps le respectent.
- ⚠️ **Le param `?brand=` n'est PAS universel** : seule `poll` le lit (`urlParams.get('brand')`), pour son intégration `pme`. Ne pas confondre avec la **couleur de marque du design system** (variables CSS `--color-fill-brand`, classes `bg-brand`) qu'utilisent `facts`, `potm`, `quiz` — celle-ci vient du CSS, pas de l'URL.
- Chargement typique : `fetchWidgetData(docId, 'widgets')` → incrément de vue via `incrementCounterViews` → event analytics via `dataLayerPush*` (poussé dans `window.blickDataLayer`).
- Anti-double-vote côté client via `localStorage` (clé `hasVoted_<docId>` etc.), désactivable par un flag `isDev` dans le composant.
- `vite.config.js` des apps clientes et du backend utilise `base: "./"` (chemins relatifs → app agnostique au dossier de déploiement) et `envDir: '../../'` (les variables d'env sont lues à la **racine du monorepo**).

### Boilerplate `index.html` (à répliquer dans toute nouvelle app cliente)

Le `<head>`/`<body>` de chaque app cliente doit contenir, en plus du montage React :

- **`<script>window.blickDataLayer = [];</script>`** en tout premier dans le `<head>` — initialise le dataLayer **avant** tout `dataLayerPush*`. Sans ça, l'analytics est silencieusement perdu.
- **`<link rel="stylesheet" href="https://utils.blick.ch/static/global/css/base.css" />`** — feuille de styles **globale chargée depuis le CDN** (pas un fichier local du repo). Fournit le socle visuel commun, dont les variantes de couleurs du darkmode.
- **`<script src="https://www.blick.ch/assets/iframeHeightAdjustment.js"></script>`** — ajuste la hauteur de l'iframe côté page hôte.

Ces trois éléments sont présents dans les 10 apps clientes actuelles. Lors de la création d'une nouvelle app, **vérifier que le dataLayer fonctionne** (init dans `index.html` + appels `dataLayerPushView(docId, 'NOM_WIDGET')` dans `App.jsx`, nom en MAJUSCULES).

### Styling : Tailwind

**Tailwind est actif dans toutes les apps** (les 10 clientes + le `backend`) et **toute nouvelle app cliente doit être stylée en Tailwind**. Partout le style est **hybride** : classes utilitaires Tailwind dans le JSX + classes SCSS custom (modules, `_variables.scss`…).

Deux setups coexistent selon l'âge de l'app :

| Setup | Apps | Comment Tailwind entre |
|---|---|---|
| **v4** (à privilégier) | `prono`, `testimony` (les plus récentes) | `@import "tailwindcss";` dans `src/tailwind.css`, importé par `main.jsx` ; plugin `@tailwindcss/vite` dans `vite.config.js` |
| **v3** (historique) | les 8 autres apps clientes + `backend` | directives `@tailwind base/components/utilities;` **dans `App.scss`** ; compilé par `postcss.config.cjs` + `tailwind.config.js` |

Setup v4 de référence (cf. `testimony`) :

- `vite.config.js` : `import tailwindcss from '@tailwindcss/vite'` + `plugins: [react(), tailwindcss()]`.
- `src/tailwind.css` : `@import "tailwindcss";` puis un bloc `@theme { … }` pour les overrides du design system (tailles de texte, breakpoints…).
- `src/main.jsx` : `import './tailwind.css';`

⚠️ **Piège** : la ligne `//import './index.css'` commentée dans les `main.jsx` des apps v3 est un **vestige trompeur** (ce `index.css` n'existe pas). Elle ne signifie **pas** que Tailwind est désactivé : dans ces apps il est injecté via `App.scss`. Pour savoir comment une app charge Tailwind, chercher les directives `@tailwind` / `@import "tailwindcss"` dans `src/`, pas l'import dans `main.jsx`.

#### Direction pour le nouveau code

- **Tailwind v4** (`tailwind.css` + plugin `@tailwindcss/vite`) — pas v3.
- **Plus de SCSS.** Le SCSS des premières apps est un héritage **abandonné**. Le complément à Tailwind se fait désormais en **CSS standard avec des variables CSS** (pas de `.scss`, pas de `_variables.scss`, pas de préprocesseur).
- Les couleurs viennent des **variables du design system** (`base.css` CDN), condition du darkmode.

### Intégrer un widget développé ailleurs

Cas de figure attendu : reprendre un widget codé hors du monorepo pour l'intégrer aux Blick Tools. En plus de le câbler sur les 3 faces habituelles (Firestore 4 blocs / app cliente / form backend) :

- **Transvaser le style vers des classes Tailwind.** Ces widgets externes arrivent typiquement avec l'essentiel de leur style dans un gros fichier CSS/SCSS ; l'objectif est de convertir ce style en classes Tailwind dans le JSX plutôt que de trimballer le CSS tel quel.
- Ne garder en CSS que ce que Tailwind n'exprime pas raisonnablement (animations complexes, sélecteurs exotiques).
- **Remplacer les couleurs en dur par les variables du design system** (celles du `base.css` CDN) — sinon le darkmode `#theme=dark` ne suivra pas.

### DataLayer / analytics

Les helpers vivent dans `packages/services/analytics.js` : `dataLayerPushView`, `dataLayerPushSeeAllClick`, `dataLayerPushLinkGlobalClick`. Ils poussent des events (`iframe_impression`, etc.) dans `window.blickDataLayer` uniquement s'il existe — d'où l'importance de l'init dans `index.html`. La vue est typiquement envoyée une fois le document chargé, en parallèle de `incrementCounterViews`.

### Darkmode

Le darkmode est **entièrement piloté par le CSS**, pas par le JS. Il suffit que l'URL de l'iframe se termine par **`#theme=dark`** et le widget passe en couleurs sombres.

- Tout vient du **`base.css` CDN** (`https://utils.blick.ch/static/global/css/base.css`) chargé dans `index.html` : il définit à la fois les variables de couleur (via des « theme toggles » CSS type `--is-light-theme` / `--is-dark-theme`) **et** la bascule déclenchée par `#theme=dark`. **Aucun code par app n'est nécessaire** — c'est pour ça que ça marche identiquement sur les 10 apps du moment que `base.css` est présent et que les styles consomment ces variables.
- **Condition côté app** : styler avec les variables de couleur du design system (celles pilotées par les toggles), pas des couleurs en dur. Un fichier local `src/styles/_utils_backup.css` reproduit ces variables à titre de référence (il n'est pas forcément importé — la source de vérité reste le `base.css` CDN).
- **Cas où du JS lit quand même le hash** : quelques apps (`potm`, `quiz`) lisent `window.location.hash.includes('theme=dark')` en JS, uniquement quand elles doivent calculer une couleur côté JS (ex. couleurs de graphes/inline impossibles à exprimer en pure CSS). Ce n'est **pas** le mécanisme de bascule, juste un complément ponctuel.
- **Variante marque `pme`** : `poll` porte en plus un mécanisme distinct pour l'intégration `pme` — écoute d'un `postMessage` `{ type: "dark-mode", isDark }` envoyé par la page parente, qui toggle une classe `.dark`. À ne reprendre que si l'intégration cible l'exige.

### Consent / RGPD

Aucun snippet de gestion du consentement (CMP, `__tcfapi`, Didomi, OneTrust…) n'est **actuellement intégré** dans les apps clientes ni leurs `index.html`. Si un besoin consent apparaît, c'est à ajouter — ne pas partir du principe qu'il existe déjà.

## Configuration & environnement

Trois fichiers d'env à la racine (git-ignorés), tous préfixés **`VITE_`** et lus par toutes les apps via `envDir: '../../'` :

- **`.env`** — le fichier **effectivement utilisé** au build / au run. Il n'a pas de contenu propre : c'est **une copie de `.env-test` ou de `.env-prod`** selon la tâche en cours. **Toujours vérifier lequel est actif avant de builder ou de lancer une app** (on ne veut pas écrire dans la mauvaise base).
- **`.env-prod`** — identifiants Firebase de la base de **production**.
- **`.env-test`** — identifiants Firebase de la base de **test / backup**.

Détails :

- `packages/services/firebase.js` initialise deux instances Firestore : `db` (config `VITE_FIREBASE_*`, = le `.env` actif) et `prodDb` (config `VITE_FIREBASE_PROD_*`, initialisée seulement si présente). Long-polling forcé (`experimentalForceLongPolling`).
- **`utils` a besoin des deux connexions en même temps** (test *et* prod) pour son rôle de migration — d'où la double instance `db` / `prodDb`. Les apps clientes et le backend, eux, ne tapent qu'une seule base à la fois (le `.env` actif).
- Auth : Firebase Auth email/password, uniquement dans le backend.
- Les règles de sécurité Firestore de production sont documentées dans `security-rules-prod.md`.

## Déploiement

Stratégie FTP « in-place » : le `dist/` de chaque widget est uploadé directement dans son ancien dossier FTP `bl-tools-client-<widget>`. Grâce à `base: "./"`, aucune redirection n'est nécessaire. Le backend inclut un `upload.php` pour l'upload d'images côté serveur.
