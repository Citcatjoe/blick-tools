# Guide de Création d'un Nouveau Type de Widget

Ce guide détaille la structure interne standardisée qu'**absolument tout** nouveau type de widget (document) doit respecter dans la base de données Firestore (collection `widgets`).

## 1. L'Architecture à 4 Blocs (La Règle d'Or)

Tous les documents dans Firestore possèdent uniquement 4 propriétés à leur racine. **Il est strictement interdit d'ajouter des propriétés supplémentaires à la racine du document.**

Voici le template JSON que vous devez suivre à la lettre pour créer la logique d'un nouveau widget :

```json
{
  "type": "nom_du_widget",
  "meta": {
    "id": "abc123def456",
    "brand": "blick",
    "theme": "Sport",
    "author": "email@example.com",
    "deleted": false,
    "timeCreated": "<Firestore Timestamp>",
    "timeUpdated": "<Firestore Timestamp>",
    "title": "Le titre principal affiché",
    "label": "Un label secondaire (optionnel)"
  },
  "stats": {
    "views": 0,
    "clicks": 0,
    "votre_nouveau_compteur": 0
  },
  "data": {
    "champMetier1": "valeur",
    "champMetier2": 42,
    "tableauSpecifique": []
  }
}
```

---

## 2. Détail des Blocs

### 2.1. `type` (String)
Il s'agit du seul champ primitif à la racine.
- Il **doit** correspondre exactement au type métier (ex: `poll`, `calendar`, `quiz`).
- Il permet au Backend et au Frontend de savoir quel composant ou logique appliquer.

### 2.2. `meta` (Object)
Ce bloc contient les **métadonnées universelles** partagées par tous les widgets. Il est utilisé par le Backend pour gérer la liste (filtrage, recherche, etc).
- `id` : L'identifiant Firestore du document.
- Les autres champs (`brand`, `theme`, `author`, `deleted`, `timeCreated`, `timeUpdated`) sont obligatoires.
*(Note : Contrairement aux anciennes versions, `meta` ne contient **plus** de champs métiers comme `title` ou `label`. Ces informations vont systématiquement dans `data`.)*

### 2.3. `stats` (Object)
Ce bloc isole **uniquement les compteurs et métriques** de performance du widget.
- **Pourquoi isoler les stats ?** : Les compteurs subissent énormément d'écritures asynchrones de la part des utilisateurs finaux (clics, vues, votes). Les placer ici permet de faire des mises à jour atomiques de manière très ciblée sans polluer le reste du document.
- Mettez-y les champs comme `views` (commun à tous), mais aussi vos compteurs spécifiques (`totalVotes`, `clicks`, etc.).
- **IMPORTANT - Objets réordonnables** : Si le widget gère une liste d'éléments modifiables/réordonnables depuis le backend (ex: questions, réponses, cartes), les compteurs doivent **absolument être mappés par l'ID unique de l'élément** au lieu de l'index du tableau. Exemple: `stats.answerCounters["id_123"] = 42`.

### 2.4. `data` (Object)
C'est le bac à sable métier. Ce bloc contiendra **toutes les autres données spécifiques à votre nouveau widget**.
- Les champs globaux textuels (ex: `title`, `label`, `teaserTitle`, `folderName`) **doivent obligatoirement être stockés ici**, peu importe le widget.
- C'est ici que vous définissez votre propre structure (tableaux d'items, réglages de couleurs, URLs d'images...).
- Tout ce qui relève de la personnalisation de votre composant va ici, **à l'exception totale des compteurs** qui vont dans `stats`.

---

## 3. Implémentation Backend (Pattern Adapter)

Lorsque vous ajoutez un nouveau widget dans l'application **Backend**, l'interface de gestion (`Form.jsx`) agit comme un "Adaptateur" :

1. **Chargement (`getLegacyEmbed`)** : S'occupe de transformer le modèle à 4 blocs vers un modèle "à plat" traditionnel (pour le formulaire React).
2. **Sauvegarde Initiale (`transformWidgetData`)** : Re-package les données du formulaire dans la stricte architecture à 4 blocs (`meta`, `stats`, `data`) juste avant l'envoi à Firestore.
3. **Mise à jour (Transactions) 🚨 IMPORTANT** : 
   - Pour l'édition de widgets contenant des compteurs alimentés par les utilisateurs (Sondages, Joueurs du match, Dossiers), vous **devez** utiliser `runTransaction` lors de la sauvegarde (`handleSave`).
   - La transaction doit lire les compteurs existants depuis Firestore (`currentData.stats`) et les fusionner avec la mise à jour, pour être enregistrés **uniquement dans `finalWidgetData.stats`**.
   - Il est **strictement interdit** de réinjecter ou de fusionner ces compteurs à l'intérieur de `finalWidgetData.data`.

### 🚨 Règle d'or pour les listes d'éléments
Si votre composant de formulaire permet d'ajouter dynamiquement des éléments qui vont recevoir des votes/clics (ex: `PollForm.jsx` ou `FolderForm.jsx`), le composant React **doit générer et conserver un identifiant unique (`id` UUID ou timestamp)** pour chaque élément. 
Ne vous basez jamais sur l'index du tableau (`index`) ou sur le nom de l'élément pour mapper des compteurs, utilisez l'identifiant !

---

## 4. Calcul de Performance (Interactions)

Le Backend et les workflows automatisés externes (ex: n8n pour les rapports analytiques) calculent une métrique de "Performance" (affichée sous la colonne "Inter.") globale pour chaque widget.

Voici la liste exhaustive des champs du bloc `stats` utilisés pour ce calcul, selon le type du widget :

- **testimony** : Nombre de témoignages soumis.
  - Champ : `stats.msgSent`
- **teaser** : Nombre de clics sur le teaser.
  - Champ : `stats.clicks`
- **prono** : Total des pronostics effectués par les utilisateurs.
  - Champ : Somme des valeurs contenues dans l'objet `stats.itemVotes` (nombre de clés dynamique)
- **facts** : Clics sur le bouton "De quoi s'agit-il ?" additionné aux notes attribuées.
  - Champ : `stats.reveal` + Somme des valeurs contenues dans l'objet `stats.ratingStats`
- **folder** : Total des clics sur l'ensemble des boutons du dossier.
  - Champ : Somme des valeurs contenues dans l'objet `stats.buttonClicks` (nombre de clés dynamique)
- **tinder** : Total des votes (OUI/NON) pour chaque carte proposée.
  - Champ : Pour chaque identifiant dans `stats.tinderVotes`, somme des propriétés `yes` et `no`
- **poll** : Total absolu des votes soumis.
  - Champ : Somme des valeurs contenues dans l'objet `stats.answerCounters` (nombre de clés dynamique, ex: de 2 à 10+ réponses possibles)
- **potm** : Nombre total de votes pour les différents joueurs/joueuses.
  - Champ : Somme des valeurs contenues dans l'objet `stats.playersVotes` (nombre de clés dynamique)
- **quiz** : Nombre de questionnaires complètement terminés.
  - Champ : Somme des valeurs contenues dans l'objet `stats.statsGlobal.scoreDistribution` (addition de toutes les classes de score)
- **calendar** : *Aucune performance calculée pour le moment.*
