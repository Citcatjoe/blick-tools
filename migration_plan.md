# Plan de Refactorisation de la Base de Données "Blick Tools"

## 📌 Statut & Contexte Actuel
- La stratégie validée est une migration **"Blue/Green"** : nous avons copié les données de `embeds` vers une nouvelle collection **`widgets`** en transformant leur structure.
- L'architecture cible avec `meta`, `stats`, et `data` est validée.
- **Le script de migration** a été exécuté avec succès sur la base de **Production**.
- **Security Rules Prod** : Les règles ont été dédoublées. L'ancienne collection `embeds` conserve ses règles strictes (pour ne rien casser des apps actuelles). La collection `widgets` a de nouvelles règles simplifiées.
- **Le Backend (Interface d'administration)** a été entièrement adapté et validé.
- **Stratégie de Déploiement FTP** : Remplacement "Sur Place" (In-Place). Les builds modernes (`dist` de Vite) seront uploadés directement dans les anciens dossiers FTP (`bl-tools-client-xxx`). Aucune redirection (ni `.htaccess`, ni JS) n'est nécessaire car les chemins relatifs (`base: "./"`) rendent les apps agnostiques au nom du dossier.

---
## Goal Description
Ce plan détaille la migration de la collection `embeds` (hétérogène) vers une nouvelle collection `widgets` (homogène). L'objectif est de standardiser la racine des documents Firestore pour faciliter le requêtage, la sécurité et la maintenance du backend, tout en encapsulant les données spécifiques à chaque widget dans un sous-objet `data`.

## User Review Required
> [!IMPORTANT]
> - Veuillez confirmer le nom de la nouvelle collection : **`widgets`** (actuellement `embeds`).
> - Vérifiez le mapping (tableau ci-dessous) pour vous assurer qu'aucun champ métier n'a été mal interprété.
> - Confirmez que nous utiliserons l'application **Utils** pour exécuter le script final de migration.

## Proposed Changes

### Nouvelle Architecture Commune (Cible)

Tous les documents partageront **exactement** cette racine :

```typescript
{
  "type": "poll",              // Le type du widget (SEUL CHAMP A LA RACINE)
  
  // Méta-données standardisées
  "meta": {
    "id": "...",                 // ID généré (string)
    "brand": "blick",            // La marque (string)
    "theme": "Sport",            // Le thème (string)
    "author": "email@...",       // Auteur (string)
    "deleted": false,            // Statut de suppression (boolean)
    "timeCreated": Timestamp,    // Date de création
    "timeUpdated": Timestamp,    // Date de dernière modification
    "title": "Titre unifié",     // Remplace pollTxt, calWording, folderName...
    "label": "Label",            // Remplace teaserLabel, folderLabel...
  },
  
  // Compteurs standardisés (Mise à jour atomique / anonyme)
  "stats": {
    "views": 1016,               // Remplace counterViews
    "clicks": 12                 // Remplace counterClicks, etc.
  },

  // Données spécifiques au type de widget
  "data": {
    // Exemples : questions, tinderCards, dates, etc.
  }
}
```

### Table de Mapping (Ancien -> Nouveau)

Voici comment les données actuelles seront transformées lors de la duplication :

| Type | Ancien Champ Racine | Nouvelle Destination |
|---|---|---|
| **Commun** | `counterViews` | `stats.views` |
| | `id`, `author`, `brand`, `theme`, `deleted`, `timeCreated`, `timeUpdated` | `meta` (ATTENTION: plus aucun champ métier ici) |
| | `type` | Reste à la racine |
| **Facts** | `rencontre` | `data.title` |
| | `counterReveal` | `stats.reveal` |
| | `date`, `items` (imbriqués) | `data.date`, `data.items` (aplatis à la racine de `data`, suppression du conteneur `factsData`, compteurs déplacés dans `stats.itemCounters`) |
| **Teaser** | `teaserTitle`, `teaserLabel` | `data.title`, `data.label` |
| | `counterClicks` | `stats.clicks` |
| | `img`, `linkGlobal...` | `data.img`, `data.linkGlobal...` |
| **Quiz** | `title` | `data.title` |
| | `conclusion`, `questions` | `data.conclusion`, `data.questions` (ajouter `id` par question) |
| | `statsGlobal`, `statsQuestions` | `stats.statsGlobal`, `stats.statsQuestions` (Map par ID de question) |
| **Potm** | `totalVotes` | `stats.totalVotes` |
| | `context`, `players` | `data.context`, `data.players` (retirer `votes` de chaque `player` pour créer `stats.playersVotes` par ID) |
| **Tinder** | `tinderTitle`, `tinderLabel` | `data.tinderTitle`, `data.tinderLabel` |
| | `tinderCards`, `tinderLegend` | `data.tinderCards` (ajouter `id` par carte), `data.tinderLegend` |
| | `tinderVotes` | `stats.tinderVotes` (Map par ID de carte) |
| **Prono** | `pronoData` | `data.pronoData` (retirer `votes` des `items` pour les mettre dans `stats.itemVotes` par ID) |
| **Folder** | `folderName`, `folderLabel` | `data.folderName`, `data.folderLabel` |
| | `folderLabelColor`, `img`, `buttons` | `data.folderLabelColor`, `data.img`, `data.buttons` (retirer `buttonCounterClicks` pour les mettre dans `stats.buttonClicks` par ID) |
| **Calendar**| `calWording` / `calName` | `data.title` |
| | `counterSeeAllClicks` | `stats.seeAllClicks` |
| | `dates`, `linkGlobal...`, `nbElemsToShow` | `data.dates`, `data.linkGlobal...`, `data.nbElemsToShow` |
| **Poll** | `pollTxt` | `data.question` |
| | `answerTxts` | `data.answerTxts` (transformé en tableau d'objets `{id, text}`) |
| | `answerCounters` | `stats.answerCounters` (Map par ID de réponse) |
| **Testimony**| `content` (`map` de `title`, `subject`, `question`, `timeExpires`) | `data` (`map` avec champs directement au 1er niveau) | N/A | Le niveau `content` est supprimé, tout est mis à la racine de `data` |

## Étapes de Mise en Œuvre

### 1. Création du Script de Migration (✅ Fait)
- Script implémenté dans l'onglet "Refactor" de l'application `utils`.
- Le script gère le traitement document par document de façon séquentielle avec gestion des erreurs (pas de batch, pour privilégier la transparence des logs).

### 2. Adaptation du Backend (✅ Fait)
Plutôt que de réécrire les 10 formulaires complexes (Quiz, Tinder, Sondage, etc.), nous utilisons un **"Pattern Adapter"** dans le fichier `Form.jsx` :
- **À la lecture (Edit)** : L'adaptateur aplatit l'objet `widget` issu de la DB en une structure "legacy" avant de la passer aux formulaires.
- **À la sauvegarde** : L'adaptateur prend la donnée issue du formulaire et la range dans la structure cible (`{ type, meta, stats, data }`) avant l'envoi à Firestore, tout en préservant méticuleusement les compteurs existants.
- **Lien de partage** : Le composant `ListItem.jsx` génère des liens qui pointent vers les dossiers FTP "legacy" (`bl-tools-client-[app]`) pour correspondre à notre stratégie de déploiement (Option A).

### 3. Adaptation des Applications Clientes (En cours)
Nous allons adapter chaque application front-end pour lire la collection `widgets` et interpréter la nouvelle structure à 4 blocs au lieu de l'ancienne.

**Progression :**
- [x] Application `calendar`
- [ ] Application `poll` (en cours)
- [ ] Application `teaser`
- [ ] Application `folder`
- [ ] Application `tinder`
- [ ] Application `quiz`
- [x] Application `testimony` (utilisé pour les tests Canary)
- [x] Application `potm` (Adapté - vérifier si testé)
- [ ] Application `prono`
- [x] Application `facts` (Adapté - vérifier si testé)

### 4. Procédure de Déploiement en Production (Option A : "In-Place")
Le déploiement se fera application par application (stratégie Canary), pour minimiser les risques :
1. Pousser le `security-rules-prod.md` sur Firebase pour sécuriser `widgets` (✅ Fait).
2. Lancer la migration des données de prod depuis l'app `utils` (✅ Fait).
3. Construire l'app ciblée (ex: `npm run build:testimony`) en s'assurant que le `.env` pointe sur la Prod.
4. Uploader le contenu du dossier `dist` directement dans l'ancien répertoire du FTP (ex: `/__is_embed_somewhere/bl-tools-client-testimony`).
5. Aucune redirection `.htaccess` ou `JS` n'est requise. Les anciens articles afficheront instantanément la nouvelle version du widget.
6. En cas de bug, restaurer le dossier original (renommé en `___OLD`) pour faire un Rollback instantané.

## Verification Plan

- [x] Lancer la migration sur 1 document de chaque type en base de Test et vérifier sa structure.
- [ ] Vérifier que chaque application cliente (npm run dev:<app>) affiche correctement les données mockées avec le nouveau format.
- [ ] Tester la création, édition et suppression d'un widget depuis le Backend local en lisant la base de Test.
