# Blick Tools Monorepo

Bienvenue dans le monorepo des widgets Blick ! Ce dépôt regroupe l'ensemble des widgets "clients" (Sondage, Calendrier, Folder, Teaser...) ainsi que les paquets partagés qui leurs sont communs.

## 🏗️ Architecture du Monorepo

Le projet est divisé en deux grands dossiers :

- `/apps` : Contient toutes les applications individuelles (les widgets et le dashboard). Chaque widget a son propre système de build (Vite) et tourne indépendamment des autres pour produire une Iframe légère.
- `/packages` : Contient le code partagé. 
  - `@rms/ui` : Composants React réutilisables, agnostiques, qui adaptent leur style en fonction du paramètre de marque (`?brand=...`).
  - *(À venir)* `@blick/core` : Logique partagée (connexion Firebase, DataLayer, Analytics, schémas de données).

## 🚀 Comment ça marche ?

Nous utilisons les **NPM Workspaces**. Cela signifie que toutes les dépendances sont gérées depuis la racine et que les paquets locaux (`@rms/ui`) sont liés automatiquement via des liens symboliques.

### 1. Installation

À la racine du projet, exécutez simplement :

```bash
npm install
```
Cela va installer les modules pour toutes les applications et lier les packages locaux.

### 2. Lancer un widget en développement

Vous pouvez lancer les scripts depuis la racine pour n'importe quelle app :

```bash
npm run dev:poll       # Lance le widget Sondage
npm run dev:calendar   # Lance le widget Calendrier
npm run dev:folder     # Lance le widget Folder
npm run dev:teaser     # Lance le widget Teaser
```

### 3. Builder un widget

```bash
npm run build:poll
npm run build:calendar
# etc...
```

## 🧩 Utiliser le package partagé UI

Dans n'importe quel widget (ex: `apps/poll`), vous pouvez importer des composants depuis le package `@rms/ui` sans avoir à le publier sur npm.

```jsx
import { Titlebar } from '@rms/ui';
```

*(Note: Assurez-vous que `"@rms/ui": "*"` est présent dans le `package.json` de votre application)*.

## ➕ Ajouter un nouveau widget

1. Créez un nouveau dossier dans `/apps/nouveau-widget` (ou déplacez un ancien repo ici).
2. Ajoutez `"@rms/ui": "*"` dans les dépendances de son `package.json`.
3. À la racine du monorepo, ajoutez les raccourcis dans le `package.json` (`dev:nouveau-widget`, `build:nouveau-widget`).
4. Lancez `npm install` à la racine pour mettre à jour les liens.
