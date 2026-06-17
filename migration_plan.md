# Plan de Refactorisation de la Base de Données "Blick Tools"

## 📌 Statut & Contexte Actuel (Pour reprise)
**Où en sommes-nous ?** 
- Nous avons décidé d'uniformiser la structure de données des 10 types de widgets (actuellement dans la collection `embeds`).
- La stratégie validée est une migration **"Blue/Green"** : nous allons copier les données de `embeds` vers une nouvelle collection **`widgets`** en transformant leur structure au passage. Cela garantit un risque zéro pour la production existante.
- L'audit de l'ancienne structure a été fait, et la nouvelle architecture standard (avec `meta`, `stats`, et `data`) a été définie (voir "Proposed Changes" ci-dessous).
- **Prochaine étape** : Coder le script de migration réel dans l'onglet "Refactor" de l'application `utils`. Ce script lira `embeds`, appliquera le mapping du tableau ci-dessous, et écrira dans `widgets`. 

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
  "id": "...",                 // ID généré (string)
  "type": "poll",              // Le type du widget
  "brand": "blick",            // La marque (string)
  "theme": "Sport",            // Le thème (string)
  "author": "email@...",       // Auteur (string)
  "deleted": false,            // Statut de suppression (boolean)
  "timeCreated": Timestamp,    // Date de création
  "timeUpdated": Timestamp,    // Date de dernière modification
  
  // Méta-données standardisées
  "meta": {
    "title": "Titre unifié",   // Remplace pollTxt, calWording, folderName...
    "label": "Label",          // Remplace teaserLabel, folderLabel...
  },
  
  // Compteurs standardisés
  "stats": {
    "views": 1016,             // Remplace counterViews
    "clicks": 12               // Remplace counterClicks, etc.
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
| | `author`, `brand`, `theme`, `deleted`, `type`, `timeCreated`, `timeUpdated` | Restent à la racine |
| **Facts** | `rencontre` | `meta.title` |
| | `counterReveal` | `stats.reveal` |
| | `date`, `items`, `factsData` | `data.date`, `data.items`, `data.factsData` |
| **Teaser** | `teaserTitle` | `meta.title` |
| | `teaserLabel` | `meta.label` |
| | `counterClicks` | `stats.clicks` |
| | `img`, `linkGlobal...` | `data.img`, `data.linkGlobal...` |
| **Quiz** | `title` | `meta.title` |
| | `conclusion`, `questions`, `statsGlobal`, `statsQuestions` | `data.conclusion`, `data.questions`, `data.statsGlobal`, `data.statsQuestions` |
| **Potm** | `totalVotes` | `stats.totalVotes` |
| | `context`, `players` | `data.context`, `data.players` |
| **Tinder** | `tinderTitle` | `meta.title` |
| | `tinderLabel` | `meta.label` |
| | `tinderCards`, `tinderVotes`, `tinderLegend` | `data.tinderCards`, `data.tinderVotes`, `data.tinderLegend` |
| **Prono** | `pronoData` | `data.pronoData` |
| **Folder** | `folderName` | `meta.title` |
| | `folderLabel` | `meta.label` |
| | `folderLabelColor`, `img`, `buttons` | `data.folderLabelColor`, `data.img`, `data.buttons` |
| **Calendar**| `calWording`, `calName` | `meta.title` |
| | `counterSeeAllClicks` | `stats.seeAllClicks` |
| | `dates`, `linkGlobal...`, `nbElemsToShow` | `data.dates`, `data.linkGlobal...`, `data.nbElemsToShow` |
| **Poll** | `pollTxt` | `meta.title` |
| | `answerTxts`, `answerCounters` | `data.answerTxts`, `data.answerCounters` |
| **Testimony**| `title` | `meta.title` |
| | `counterMsgSent` | `stats.msgSent` |
| | `content` | `data.content` |

## Étapes de Mise en Œuvre

1. **Création du Script de Migration dans Utils** :
   - Ajout de la logique de transformation (mapping) dans l'onglet "Refactor".
   - Test de la migration d'un document par type depuis `embeds` vers la base de **Test**.
2. **Adaptation des 11 Applications Clientes** :
   - Mise à jour des appels Firestore (ex: pointer sur `widgets`).
   - Mise à jour des props React pour lire `doc.meta.title` au lieu de `doc.pollTxt`.
3. **Adaptation du Backend** :
   - Mise à jour des formulaires pour écrire selon la nouvelle structure.
   - Modification des requêtes de la liste des documents pour pointer sur la nouvelle collection.
4. **Exécution Finale** :
   - Déploiement de toutes les apps avec la nouvelle logique.
   - Clic sur "Migrer Tout" dans l'application Utils pour populer la nouvelle collection de Production `widgets`.

## Verification Plan

- [ ] Lancer la migration sur 1 document de chaque type en base de Test et vérifier sa structure.
- [ ] Vérifier que chaque application cliente (npm run dev:<app>) affiche correctement les données mockées avec le nouveau format.
- [ ] Tester la création, édition et suppression d'un widget depuis le Backend local en lisant la base de Test.
