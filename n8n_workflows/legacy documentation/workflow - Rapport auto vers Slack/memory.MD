# 🧠 Mémoire du Projet : Rapport Auto vers Slack

> [!IMPORTANT]
> **Maintenance de la Documentation** : Toute modification apportée à ce projet (nœuds n8n, logique métier, formatage) doit impérativement être documentée de manière proactive et automatique en suivant les directives du skill [workflow_documentation_maintainer.md](../skills/workflow_documentation_maintainer.md).

## 📝 Présentation du Projet
Système automatisé de reporting éditorial pour **Blick**. Le workflow analyse les performances des widgets interactifs du mois écoulé, génère une analyse qualitative via une IA locale, et propose des recommandations pour le mois suivant.

- **Nom du Bot** : Blick Tools MegaMind
- **Personnalité IA** : Analyste expert, direct, pertinent et orienté résultats.
- **Canal de sortie** : Slack.

---

## 🛠️ Architecture Technique
- **Orchestrateur** : n8n (Self-hosted sur NAS).
- **Moteur IA** : LM Studio (Mac Mini).
- **Modèle** : LLM local chargé via l'interface "Local Server" (Utilisation du node *OpenAI Chat Model*).
- **Sources de données** : Firebase (Mois en cours & précédent) et API Monday.com.
- **Flux de données complet** : 
  1. `Trigger` : Cron quotidien à 9h → Filtre "Dernier jour du mois".
  2. `Préparation` : Calcul des dates.
  3. `Extraction` (en parallèle) : Firebase Current + Firebase Previous + HTTP Request Monday.com.
  4. `Consolidation` : Double noeud Merge (Append).
  5. `Cuisine` : Agrégation et préparation JSON.
  6. `Analyse IA` : Basic LLM Chain.
  7. `Formatage` : Deux noeuds *Code in JavaScript* successifs.
  8. `Diffusion` : JSON to Slack msg (Node actuellement *désactivé*).

---

## 🌐 Paramètres de Connexion (Critique)
> [!IMPORTANT]
> En cas de perte de connexion, vérifier les adresses IP.

- **Réseau cible** : `192.168.50.XX` (Réseau du Routeur).
- **URL Base LLM** : `http://[IP_MAC_MINI]:1234/v1`
- **Port LM Studio** : `1234`.
- **Sécurité Mac** : Toujours vérifier que LM Studio a l'option "Allow Network Access" activée et que le serveur est sur "Start".

---

## 🏗️ Logique métier & JavaScript

> [!WARNING]
> **Mode Développement Actif** : Le premier nœud de code `continue if last day of the month` contient actuellement un bypass (`if (true)`) permettant de laisser passer les données tous les jours afin de faciliter les tests. La condition `if (tomorrow.getDate() === 1)` est commentée.

### 1. Gestion et Calcul des Dates
Le nœud "Calcul des Dates" génère dynamiquement les bornes temporelles pour filtrer les bases de données. Il retourne un objet JSON contenant les dates de début (`start`) et de fin (`end`) au format ISO, ainsi qu'un libellé formaté en français (ex: "mai 2026"), pour trois périodes :
- **Mois en cours** (`current`) : Du 1er jour à 00:00:00 au dernier jour à 23:59:59 du mois actuel.
- **Mois précédent** (`previous`) : Utilisé pour extraire les données passées et calculer l'évolution.
- **Mois prochain** (`next`) : Calculé pour les prévisions ou recommandations futures.

### 2. Nœud "Cuisine" (Agrégation & Préparation pour l'IA)
C'est le véritable moteur de préparation des données avant l'IA. Il effectue plusieurs tâches critiques :
- **Extraction & Nettoyage** : Génère des titres lisibles selon le type de widget (ex: extraction des équipes pour les pronostics).
- **Calcul de l'Engagement** : Applique une formule de calcul spécifique pour chaque type de widget (ex: total des votes pour "potm", somme des clics pour "folder", clicks + ratings pour "facts").
- **Dictionnaire de Traduction** : Convertit les types techniques en français lisible (`poll` → Sondage, `potm` → Joueur du match, etc.).
- **Traitement Firebase** : Filtre systématiquement les documents supprimés (`deleted !== true`). Il trie ensuite toutes les données du mois par ordre d'engagement décroissant.
- **Moteur d'Exclusion Évolutif** : Pour éviter d'afficher dans le classement Tops/Flops des widgets détournés qui ne peuvent pas techniquement générer d'engagement (comme les Power Rankings statiques de type `facts`), le nœud intègre un tableau extensible de fonctions règles `exclusionRules`. Si un widget remplit l'une des conditions (ex: widget `facts` sans aucun item de type `number` ou `rating`), il reçoit la propriété `exclure_classement: true` pour indiquer qu'il doit être ignoré dans les podiums, tout en restant comptabilisé dans le volume global.
- **Traitement Monday.com** : Filtre le planning éditorial du mois suivant et attribue automatiquement une "Marque" (Blick, PME, L'illustré) selon le statut ou le groupe de la carte.
- **Payload Final (Prompting)** : Construit l'objet JSON complet injecté à l'IA, contenant le contexte temporel, le bilan comparatif (avec calcul d'évolution en %), les listes détaillées et les **instructions IA directes** (règles de classement, action requise).

### 3. Nœuds de Post-Traitement (Parsing & Assemblage Slack)
- **Parsing sécurisé de l'IA** : Le premier nœud post-IA nettoie la réponse du LLM (suppression des balises markdown ` ```json ` par regex) et parse l'objet JSON via un bloc `try/catch`. En cas de plantage (hallucination du LLM), le texte brut est conservé pour le débogage.
- **Calculs de l'Efficacité** : Le dernier nœud calcule l'Indice d'Efficacité (Interactions / Volume) et son pourcentage d'évolution par rapport au mois précédent.
- **Ventilation par Rubrique (Catégorisation Dynamique)** : 
  La catégorisation est entièrement dynamique et automatisée. Le nœud extrait la propriété `theme` à la racine de chaque widget Firebase (qui remplace l'ancienne catégorisation par mots-clés statiques). Si un widget n'a pas de thème défini, il est classé par défaut sous "Non catégorisé". Le système compare ensuite les données du mois en cours avec celles du mois précédent.
  Pour éviter les calculs mathématiquement impossibles ou inesthétiques lors des transitions, des règles d'expression spécifiques ont été implémentées :
  - **Rubrique Nouvelle** (`courant > 0` et `précédent == 0`) : Affiche la mention `(Nouveau vs [Mois Précédent])` au lieu de `+Infinity%` ou `N/A`.
  - **Rubrique Disparue / Absente** (`courant == 0` et `précédent > 0`) : Affiche la mention `(Absent vs [Mois Précédent])` au lieu de `-100%` ou `N/A`, avec un volume de `0 widget`.
  - **Calcul d'évolution classique** : Applique le calcul standard `((courant - précédent) / précédent) * 100` avec la mention `(+XX.X% vs [Mois Précédent])` ou `(-XX.X% vs [Mois Précédent])`.
- **Filtrage & Extraction des Tops/Flops** : Dans le nœud d'assemblage, les widgets portant la clé `exclure_classement === true` sont éliminés lors de la constitution du tableau servant de base aux podiums. Les podiums (Top 3 / Flop 3) n'affichent ainsi que d'authentiques succès ou échecs éditoriaux interactifs, sans fausser l'analyse.
- **Assemblage** : Les suggestions de "Blick Tools MegaMind" sont traduites et intégrées dans le template littéral générant le markdown final.


### 4. Règles de Formatage Slack & Limites de Caractères
> [!IMPORTANT]
> Slack impose une limite stricte de **4 000 caractères** par message. Si elle est dépassée, le rapport est découpé en deux messages.
> Afin de garantir un rapport toujours complet dans **un message unique** (visant environ 3 000 caractères), des règles strictes de concision et des standards spécifiques sont appliqués :
> - **Champs abrégés dans les codes** : Remplacement des mots longs par des abréviations universelles (ex: `int.` pour interactions, `j.` pour jours, retrait du mot redondant `widgets` dans les listes de rubriques).
> - **Entêtes plus courtes** : E.g. *Bilan du mois passé & opportunités...* au lieu de *Analyse des performances...*.
> - **Contraintes IA strictes** : L'IA est contrainte à un maximum de 800 à 1000 caractères pour l'analyse, et à maximum 80 caractères par suggestion de titre.
> - **Standard Suisse (Milliers)** : Les nombres supérieurs à 999 doivent utiliser l'apostrophe `'` comme séparateur des milliers (ex: `23'905`, `5'472`), conformément aux normes d'écriture suisses pour Blick.
> - **Titre de la section Rubriques** : La section est nommée `*🗂️ Widgets par rubrique*` au lieu de l'ancien *Répartition par rubrique*.

- **Gras** : Utiliser une seule étoile `*texte*`.
- **Italique** : Utiliser l'underscore `_texte_`.
- **Listes** : Utiliser des puces simples `•` et des emojis pour le repérage visuel.



---

## 🤖 L'Agent IA : Philosophie Éditoriale MegaMind

Afin d'éviter des analyses fades, verbeuses et remplies de jargon corporate creux, une charte éditoriale stricte est imposée à l'agent LLM dans son prompt de cadrage.

### 1. Règle d'or : Un ton direct, sobre et strictement factuel
L'IA doit adopter la posture d'un **data analyst et chef de rédaction pragmatique et factuel** s'adressant à son équipe.
- Les phrases doivent être **courtes, claires et objectives**.
- Aucun terme familier ou trop percutant n'est toléré (interdiction absolue d'utiliser des expressions comme *cartonner, faire un carton, flop complet, bide total*).
- Zéro blabla corporate inutile, pas de fioritures ou de tournures ampoulées.

### 2. Liste des mots strictement bannis (Jargon Interdit)
Pour éliminer la langue de bois, l'agent a interdiction absolue d'utiliser le vocabulaire suivant :
* *écosystème, prépondérance, diversification stratégique, capitaliser sur, stabiliser l'engagement, temps réel, cyclique, synergie, vecteur de, pertinent/pertinence, levier, optimiser, pérenniser, impératif.*

### 3. Strictement non-directif (Pas d'ordres ou d'injonctions)
L'IA ne doit jamais se substituer à la direction de la rédaction. Les conseils impératifs ou injonctions sont interdits :
- Interdiction de formuler des ordres du type : *Il faut arrêter de..., On doit absolument..., Je conseille de...*
- L'IA se limite à dresser des constats objectifs basés sur les faits (ex: *ce format de retour sur événement n'a pas rencontré son public sur ces sujets précis*).

### 4. Exclusion de la notion de "longueur" de widget
Les types de widgets (comme Dossier, Teaser, Quiz, etc.) ne doivent jamais être jugés ou qualifiés sous l'angle de leur prétendue "longueur" (par exemple, qualifier un Dossier ou un Teaser de "format long"). La longueur n'est pas un critère pertinent et ne doit pas figurer dans l'analyse.

### 5. Les axes d'analyse obligatoires
Le prompt contraint l'IA à extraire des enseignements concrets sur des métriques simples :
- **Tendance générale** : Un constat simple sur ce qui a fonctionné ou pas, rédigé de façon sobre (ex: *L'activité a été fortement marquée par l'actualité sportive...*).
- **Performance comparée des rubriques** : Comparer les rubriques entre elles (qui domine, qui progresse, qui est en retrait) d'un mois sur l'autre.
- **Formats rares présents (1 à 9 occurrences)** : Repérer les widgets rares (comme un Dossier unique ou un Quiz produit seulement 2 fois) et analyser leur efficacité, même si leur volume est faible, sans référence à leur "longueur".
- **Le gagnant (Top 1)** : Expliquer logiquement et simplement le succès du premier widget au regard de l'évolution globale de la production et de l'engagement.
- **Les widgets moins performants (avec prise en compte de la durée de vie)** : 
  Analyser de manière factuelle et sobre les widgets n'ayant pas rencontré leur public tout en bas de la liste (widgets à 0-3 clics), sans donner de directives.
  **Règle critique** : L'IA doit impérativement croiser l'inactivité avec la `date_creation` du widget. Si un widget a été créé en toute fin de mois (ex: à moins de 3 jours de la génération du rapport), l'IA doit préciser que son faible engagement s'explique avant tout par sa durée d'exposition très courte, tandis qu'un widget inactif créé en début de mois indique un réel manque d'intérêt.


---

## 📜 Historique des incidents & Solutions

### Incident Mai 2026 : Rapport vide (0 widget) à cause de l'environnement de Test
- **Cause** : Les nœuds Firebase (en mode `Query` / Structured Query) interrogeaient la collection `questions` (base de test figée) au lieu de la base de production. Le rapport s'exécutait sans erreur, mais renvoyait un volume de 0 widget et des interactions "N/A" puisque la base de test ne contenait aucune nouvelle donnée pour le mois en cours.
- **Solution** : Dans les nœuds Firebase en mode `Query`, la collection n'est pas sélectionnable via l'interface graphique. Il a fallu modifier directement le champ `Query JSON` pour remplacer `"collectionId": "questions"` par `"collectionId": "embeds"` (la collection de production).

### Incident Mai 2026 : Crash du script d'assemblage final ("Cannot read properties of undefined (reading 'map')")
- **Cause** : Le nœud de code final cherchait la clé `propositions_mai` en dur dans le JSON renvoyé par l'IA. Au changement de mois (ou si l'IA modifie la clé en `propositions_juin` ou juste `propositions`), la clé devenait introuvable (`undefined`), faisant planter la fonction `.map()`.
- **Solution** : Mise à jour du nœud de code final pour chercher dynamiquement n'importe quelle clé commençant par `propositions` via une boucle `for...in`. Ajout d'une sécurité (`Array.isArray`) forçant un tableau vide si l'IA omet la clé, évitant ainsi tout crash futur. Profité de l'occasion pour appliquer la nouvelle nomenclature sans émojis dans les sous-rubriques.

### Incident Mai 2026 : Perte de connexion entre le NAS et le Mac Mini
- **Cause** : Reboot du routeur. Le Mac Mini a basculé sur le Wi-Fi de la Box (réseau `192.168.1.X`) au lieu du réseau local (réseau `192.168.50.X`).
- **Solution** : Redémarrage du Mac pour forcer le bail DHCP sur le bon réseau. Suppression du réseau Wi-Fi "Box" des réseaux connus sur le Mac.

---

## 📝 Structure du Rapport (Template)
- **L'Instant T** : Volume de création + détail par type + engagement total + Indice d'Efficacité.
- **Répartition** : Sport vs News Suisse vs News Inter.
- **Podium** : Top 3 (🥇, 🥈, 🥉) et Flop 3 (•).
- **Analyse de Blick Tools MegaMind** : Texte généré par le LLM.
- **Conseils Éditoriaux** : Suggestions typées et thématiques pour le mois à venir.

> 👉 **Référence de Formatage** : Voir le fichier [exemple_rapport_slack.md](./exemple_rapport_slack.md) pour un aperçu exact du rendu final visé (avec données fictives).

---

## 🚀 Prochaines étapes prévues
- [ ] **Retirer le bypass de développement (`if (true)`) dans le nœud "continue if last day of the month" pour réactiver le blocage hors du dernier jour du mois.**
- [ ] Ajuster le mapping des types pour inclure les nouveaux formats.
- [ ] Automatiser la mise en gras spécifique au format Slack dans le node Code.
- [ ] Tester l'envoi vers un canal de test avant le canal général de la rédaction.

---

## 📚 Documentation Technique Complète
Pour le code complet des nœuds de programmation JavaScript (nœud *Cuisine*, parseur de secours *Code in JavaScript*, et *Assemblage Final*), l'arbre de décision n8n et la table de renommage recommandée, veuillez vous référer au fichier dédié :
👉 **[workflow_documentation.md](./workflow_documentation.md)**

