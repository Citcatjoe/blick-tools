----------
name: blick-tools-new-content-type-adapter
description: This skills is used to prepare support for new type of widget in the backend..
----------

## 1. LOGIQUE D'ARCHITECTURE
- Ce skill régit l'intégration complète d'un nouveau type de widget dans l'interface de gestion (Back-office).
- L'intégration doit être transverse : de la navigation (UI) jusqu'à la persistance des données (Logique).
- Le nommage doit être strictement cohérent avec le `type` défini dans Firebase (ex: `poll`, `quiz`, `calendar`). Ce type sera donné lors de la demande. Ne surtout pas continuer si le type n'est pas spécifié par l'utilisateur. Ne pas improviser le type si il n'est pas donné.

## 2. ACTIONS SUR LA LISTE (ListItem.jsx)
- **Identification** : Ajouter une condition pour afficher un titre explicite et dynamique dans `.elem-list-item` selon le type.
- **Iconographie** : Injecter une icône contextuelle dans `div.icon-container` pour identifier visuellement le type de contenu.
- **Presse-papier** : Mettre à jour la fonction `handleCopy` pour construire et copier l'URL d'embed exacte correspondant au type.

## 3. ACTIONS SUR LA RACINE (App.jsx)
- **État devMode** : S'assurer qu'un état `devMode` (boolean, initialisé à `false`) existe dans `App.jsx`. Si absent, le définir.
- **Menu de Création** : Ajouter un bouton d'entrée dans `#menu-new-items` avec un label métier clair.
- **Handler de Création** : Créer une fonction `handleNew[Type]` (ex: `handleNewSurvey`) à la suite des méthodes similaires pour initialiser un document vide.
- **Recherche** : Inclure le nouveau type dans la logique de filtrage de `const filteredEmbeds` pour permettre la recherche textuelle. Ne pas oublier d'ajouter une option dans le select#type-filter permettrant de filtrer par ce nouveau type.

## 4. ACTIONS SUR LE SYSTÈME DE FORMULAIRE (Form.jsx)
- **Rendu Conditionnel** : Importer le nouveau formulaire partiel et l'intégrer dans la logique d'affichage selon le type de widget.
- **En-tête** : Mettre à jour `getFormTitle` pour retourner le titre de page adéquat en mode création/édition.
- **Persistance** : 
    - Implémenter la logique de validation des champs spécifiques.
    - Gérer les appels de sauvegarde (Firestore) et les alertes de succès/erreur dédiées au nouveau type.

## 5. CRÉATION DU FORMULAIRE PARTIEL (Components/Form/)
- **Fichier** : Créer un fichier `[TypeName]Form.jsx`.
- **Contenu** : 
    - Doit inclure une structure de base pour éditer l'objet `config` du widget.
    - Doit gérer ses propres `onChange` et états locaux de formulaire.
    - Doit respecter les normes visuelles des autres formulaires existants.

## 6. VÉRIFICATION DE COHÉRENCE
Avant de valider l'intégration, vérifier :
1. La correspondance parfaite du `type` entre le menu, le formulaire et Firebase.
2. La validité de l'URL générée pour l'export (iframe).
3. Le bon fonctionnement du filtrage dans la barre de recherche globale.

## 7. FORMAT DU RAPPORT DE SORTIE APRES LES OPERATIONS
L'agent doit retourner un rapport structuré par sections :
1. **Actions Liste (ListItem)** : [Statut OK/KO]
2. **Actions Racine (App.jsx)** : [Statut OK/KO]
3. **Actions Formulaire (Form.jsx)** : [Statut OK/KO]
4. **Création Formulaire Partiel** : [Fichier créé]
5. **Vérification Cohérence** : [Statut OK/KO]