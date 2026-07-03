# 🧠 Mémoire du Projet : Workflow - Rappel BLICK TOOLS

## 📝 Présentation du Projet
- **Objectif global** : Le workflow s'assure qu'un rythme régulier est maintenu dans la création de widgets interactifs ("BLICK TOOLS") par la rédaction. Il s'exécute quotidiennement en début de matinée et génère une alerte si aucun widget n'a été produit au cours des 4 derniers jours (paramètre ajustable).
- **Acteurs/Canaux** : 
  - **Source** : Google Firebase (Firestore).
  - **Destination** : Génération d'un message d'alerte (canal d'envoi à définir ultérieurement, potentiellement Slack).
- **Statut actuel** : En développement.

---

## 🛠️ Architecture Technique
- **Orchestrateur** : n8n
- **Dépendances** : 
  - Firebase Firestore (Les credentials n8n sont déjà configurés et fonctionnels).
- **Flux de données** : 
  `Déclencheur Quotidien (Cron)` → `Requête Firestore (récupération des N derniers documents)` → `Filtrage/Comptage (Combien datent des X derniers jours ?)` → `Évaluation conditionnelle (Nombre de widgets < Seuil ?)` → `Génération du message d'alerte` → `Action de notification`

---

## 📚 Logique Métier (Matière Professionnelle)
- **Le rôle des Widgets** : Les widgets interactifs (poll, calendar, teaser, folder, tinder, quiz, testimony, potm, prono, facts) sont embarqués sur les pages web du site. Ils constituent un excellent moyen de créer de l'engagement et de l'émulsion auprès de l'audience.
- **La problématique** : Ces modules sont créés par les journalistes lors de la mise en page de leurs articles. En raison du manque de temps ou d'attention face au rythme de l'actualité, la production de ces outils peut parfois baisser.
- **La solution** : L'alerte automatisée sert de "rappel à l'ordre" bienveillant pour la rédaction, afin de maintenir le niveau d'interactivité visé pour le lectorat.

---

## 🌐 Configuration Spécifique (Critique)
> [!IMPORTANT]
> Consigner ici les paramètres réseau ou config requises. Ne pas inclure de secrets en clair (clés API).
- **Paramètres de déclenchement** : 
  - **Fuseau Horaire** : Le workflow doit impérativement être configuré sur `Europe/Zurich` dans ses paramètres (Settings) pour que l'exécution quotidienne (9h00) et le calcul des dates (aujourd'hui - 4 jours) soient exacts.
  - **Délai** : L'intervalle de "4 jours" doit être paramétrable.
  - **Seuil de tolérance** : Le nombre minimum attendu (par défaut `0` pour alerter si strictement aucun widget n'a été fait, mais ajustable pour exiger, par exemple, au moins 3 widgets).
- **Configuration Firestore** : 
  - **Credentials** : Utilisation de l'API Firestore existante.
  - **Collection** : `widgets` (anciennement `embeds`)
  - **Champ de date** : `meta.timeCreated` (format ISO String/Timestamp)

---

## 🚀 État d'Avancement
- [x] Initialisation du répertoire de projet et de la structure documentaire.
- [x] Création du squelette du workflow dans n8n.
- [x] Connexion à Firestore et logique de requête temporelle (récupération globale et traitement via Code Node).
- [x] Logique conditionnelle (comptage dynamique) et génération du contenu du message informatif.
- **Dernière mise à jour** : Workflow finalisé, testé et documenté. Le fuseau horaire a été configuré sur Zurich. En attente de la définition du canal de diffusion (Slack ou autre) pour l'étape finale.

---

## ⚠️ Historique des Pannes et Résolutions (Troubleshooting)
- *(Aucun incident consigné pour l'instant)*
