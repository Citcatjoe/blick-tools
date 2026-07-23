# Spec — Nouveau widget « `<TYPE>` »

> Template à recopier pour chaque nouvelle app cliente. Remplir les `<…>`, supprimer les notes en citation.
> Rappel : un widget = **3 faces indissociables** → (1) modèle de données Firestore, (2) app cliente iframe, (3) formulaire backend. Les trois doivent être cohérents.
> Références : `CLAUDE.md`, `widget_structure_guide.md`.

- **Type (slug)** : `<type>` — ex. `survey`. Utilisé comme `type` racine Firestore, nom du composant frontend et du form backend.
- **Nom affiché / pitch** : `<une phrase : ce que fait le widget côté lecteur>`
- **Marques cibles** : `<blick | letemps | illustre | pme | …>`

---

## 1. Modèle de données Firestore (4 blocs)

> Collection `widgets`. **Interdit** d'ajouter des propriétés à la racine hors `type` / `meta` / `stats` / `data`.

### `data` (config métier saisie dans le backend)

| Champ | Type | Description | Obligatoire |
|-------|------|-------------|-------------|
| `title` | string | Titre principal | oui |
| `<champ>` | `<type>` | `<description>` | `<oui/non>` |

> Les libellés textuels globaux (`title`, `label`, …) vont **dans `data`**, jamais dans `meta`.
> Si le widget a une liste d'items (questions, cartes, réponses…), chaque item porte un **`id` unique** (UUID/timestamp) — décrire la forme d'un item :
>
> ```json
> { "id": "<uuid>", "<champ>": "<valeur>" }
> ```

### `stats` (compteurs alimentés par les end-users)

| Champ | Type | Alimenté par | Mapping |
|-------|------|--------------|---------|
| `views` | number | vue de l'iframe | — (commun à tous) |
| `<compteur>` | `<number / objet>` | `<action utilisateur>` | `<par id d'item / global>` |

> Compteurs **exclusivement dans `stats`**. Pour toute liste votable : mapper **par `id` d'item**, jamais par index de tableau.

### Métrique de performance (« Inter. » backend / rapports n8n)

- **Champ(s) résumant la perf** : `<ex. somme des valeurs de stats.itemVotes>`
- `<ou : aucune perf calculée pour ce widget>`

> S'aligner sur la logique existante par type dans `widget_structure_guide.md` §4.

---

## 2. App cliente (`apps/<type>/`)

- **Param d'URL** : `?<type>Doc=<firestoreId>` (+ `#theme=dark`, géré gratuitement par `base.css`). N'ajouter `&brand=` que si l'intégration l'exige vraiment (aujourd'hui seule `poll` le fait, pour `pme`).
- **Flow utilisateur** : `<décrire : état initial → interaction → état final>`
- **Écriture Firestore** : `<quelle action incrémente quoi>` — via **transaction** (`runTransaction`).
  - Helper à réutiliser / créer dans `packages/services/api.js` : `<updateXxxTransactional(...)>`
- **Anti-rejeu** : clé `localStorage` `<hasVoted_${docId} / …>`.
- **États d'affichage** : chargement · avant interaction · après interaction · déjà participé.
- **Analytics** : `dataLayerPushView(docId, '<TYPE_MAJ>')` + `<events de clic éventuels>`.
- **Boilerplate `index.html`** (cf. CLAUDE.md) : init `blickDataLayer`, `base.css` CDN, `iframeHeightAdjustment.js`.
- **Styling** : **Tailwind** (`src/tailwind.css` + plugin `@tailwindcss/vite`, cf. `testimony`/`prono`). Couleurs = variables du design system, jamais en dur, pour que `#theme=dark` fonctionne.
  - Si le widget est **repris d'ailleurs** : prévoir le transvasement du CSS existant vers des classes Tailwind.

---

## 3. Formulaire backend (`apps/backend/src/components/Form/<Type>Form.jsx`)

- **Champs du formulaire** : `<lister, en miroir de data ci-dessus>`
- **Items dynamiques** : `<oui/non>` — si oui, **générer et conserver un `id`** par item ajouté.
- **Adaptateur** :
  - `getLegacyEmbed` : 4 blocs → modèle plat pour le form.
  - `transformWidgetData` : form → 4 blocs avant envoi Firestore.
- **Sauvegarde** : si compteurs alimentés par users → `runTransaction` qui **relit `stats` existants et les merge** (ne jamais réinjecter les compteurs dans `data`).
- **Intégration dashboard** : icône `<icon-….svg>` + entrée dans le menu « nouveau ».

---

## 4. Sécurité & déploiement

- **Firestore rules** : `<nouveaux compteurs stats à autoriser en écriture publique ? cf. security-rules-prod.md>`
- **Env** : vérifier que `.env` pointe la bonne base (`.env-test` vs `.env-prod`) avant build.
- **Déploiement** : dossier FTP cible `bl-tools-client-<type>` (upload « in-place » du `dist/`).

---

## 5. Ouvertes / à valider

- `<questions en suspens, décisions à confirmer>`
