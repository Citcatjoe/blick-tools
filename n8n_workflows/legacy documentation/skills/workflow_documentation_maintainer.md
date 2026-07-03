# Skill : Mainteneur de la Documentation de Workflow (Documentation Ecosystem Maintainer)

## 🎯 Objectif
Ce skill indique à l'assistant comment créer, structurer et maintenir automatiquement à jour l'écosystème de documentation complet présent dans chaque dossier de workflow (format : `workflow - [Nom du Projet]/`). Au lieu de se limiter à un seul fichier, l'écosystème repose sur la triade cohérente et synchronisée suivante :
1. **`memory.MD`** : Mémoire vive technique du projet, consolidant l'état d'avancement, l'architecture globale, les configurations critiques (IP, ports), la logique métier synthétisée et l'historique des pannes/résolutions.
2. **`workflow_documentation.md`** : Documentation exhaustive officielle du workflow, contenant la cartographie visuelle Mermaid, le dictionnaire détaillé des nœuds, et l'intégralité des **scripts de code (JavaScript/JSON) 100% complets, datés et non-tronqués** pour chaque nœud.
3. **`exemple_rapport_slack.md`** : Exemples réels et à jour des rendus des rapports finaux envoyés (ex: sur Slack), servant de référence visuelle et de gabarit de test pour les limites de caractères (ex: 4 000 car.) et les standards régionaux (ex: standard de milliers suisse `30'480`).

---

## 📋 Déclencheurs (Quand utiliser ce skill de manière automatique)
Tu dois appliquer ce comportement de maintenance documentaire de façon proactive :
- **À la création** d'un nouveau workflow ou d'un dossier `workflow - XXXX`.
- **Dès qu'une modification (même mineure) de nœud n8n est effectuée** (changement de logique, ajustement de regex, modification d'exclusion, etc.) :
  - **Mettre à jour** le code concerné dans `workflow_documentation.md` avec la **date de mise à jour en début de section et de bloc de code** (format : `📅 Dernière version : DD mois YYYY` et dans l'en-tête du code JS `// DERNIÈRE MISE À JOUR : DD mois YYYY`).
  - **Mettre à jour** la section "Logique métier & JavaScript" et "État d'Avancement" dans `memory.MD`.
- **Dès qu'un paramètre réseau ou de configuration change** (adresse IP de l'IA locale, endpoint API Monday, token d'authentification) :
  - **Mettre à jour** la section "Configuration Spécifique / Connexion" de `memory.MD`.
- **Suite à la génération réussie d'un nouveau rapport test ou réel** :
  - **Mettre à jour** `exemple_rapport_slack.md` si le formatage ou la structure a évolué, pour garder un exemple de référence conforme et actualisé.
- **Suite à la résolution d'un bug complexe** :
  - **Consigner** l'erreur, sa cause et sa résolution dans la section "Historique des Pannes" de `memory.MD`.

---

## 🏗️ Structure standard des 3 fichiers documentaires

### 1. `memory.MD`
Ce fichier sert de point d'entrée pour la compréhension rapide de la configuration réseau et de l'architecture.

```markdown
# 🧠 Mémoire du Projet : [Nom du Workflow]

## 📝 Présentation du Projet
- **Objectif global** : [Description claire du but]
- **Nom du Bot / IA** : [Optionnel]
- **Statut actuel** : [En idéation / En développement / En production]

---

## 🛠️ Architecture Technique
- **Orchestrateur** : [ex: n8n (Self-hosted sur NAS)]
- **IA locale/distante** : [Modèle, provider, e.g. LM Studio local]
- **Flux de données** : `Source` ➔ `Traitement (Cuisine)` ➔ `Analyse IA` ➔ `Formatage` ➔ `Destination`

---

## 🌐 Paramètres de Connexion (Critique)
> [!IMPORTANT]
> Consigner ici les adresses IP, ports, et protocoles requis pour le bon fonctionnement des flux réseau. Ne jamais inclure de secrets ou de tokens en clair !

- **IPs et Ports** : [ex: 192.168.x.x:5678]
- **Endpoints de rechange** : [...]

---

## 🏗️ Logique métier & JavaScript
[Résumé conceptuel du rôle et des algorithmes des nœuds importants, par exemple le nœud de calcul d'engagement ou le moteur d'exclusions.]

---

## 🚀 État d'Avancement
- [x] Tâches terminées
- [ ] Tâches en cours / Prochaines étapes
- **Dernière mise à jour** : [Date et résumé des dernières actions]

---

## ⚠️ Historique des Pannes et Résolutions (Troubleshooting)
- **[Date de la panne] - [Message d'erreur / Symptôme]**
  - **Cause** : [Explication technique]
  - **Résolution** : [Code correctif ou manipulation système appliquée]
```

### 2. `workflow_documentation.md`
Ce document est le référentiel de code absolu. **Aucun code ne doit y être tronqué.**

```markdown
# 📘 Documentation Officielle : [Nom du Workflow]

Ce document centralise et formalise la configuration complète du workflow n8n. Il a pour objectif de pérenniser la maintenance en fournissant le **code Javascript/JSON 100% complet, daté et non-tronqué**.

---

## 🗺️ Cartographie Visuelle du Workflow
```mermaid
graph TD
    [Diagramme Mermaid coloré représentant le workflow]
```

---

## 🛠️ Dictionnaire et Propriétés des Nœuds
| # | Nom Recommandé (n8n) | Type de Nœud | Configuration & Propriétés Clés | Rôle et Utilité |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `Nom du Nœud` | `Type` | `Propriétés` | `Rôle` |

---

## 📜 Codes de Programmation 100% Complets

### X. Nœud "[Nom Exact du Nœud]"
📅 **Dernière version : DD mois YYYY** *(Résumé succinct de la modification)*

```javascript
// =========================================================================
// NŒUD n8n : [Nom Exact du Nœud]
// DERNIÈRE MISE À JOUR : DD mois YYYY (Résumé du changement)
// DESCRIPTION : [Rôle du script]
// =========================================================================

[Code JavaScript COMPLET sans aucune troncature ni placeholder]
```
```

### 3. `exemple_rapport_slack.md`
Ce fichier montre des exemples textuels complets de messages ou livrables générés.

```markdown
# 💬 Exemples de Rapports : [Nom du Workflow]

Ce document présente des exemples réels de rapports produits par le système afin de valider visuellement le formatage, le respect des standards typographiques (ex: séparateurs de milliers suisses `'` pour Blick) et la conformité à la limite de caractères.

---

## 📅 Exemple du [Date de l'exemple]
**Statut** : Conforme (Taille : XXXX caractères / Limite 4 000)

```markdown
[Contenu textuel brut ou rendu du rapport tel qu'il apparaît sur Slack]
```
```

---

## 🤖 Instructions de mise à jour pour l'IA (Mise à jour chirurgicale et automatique)

1. **Lien de cause à effet automatique** : Dès que l'utilisateur te demande de modifier un code, une règle métier ou un nœud, **mets immédiatement à jour** les fichiers du triptyque documentaire (`memory.MD`, `workflow_documentation.md` et `exemple_rapport_slack.md`) dans le workspace.
2. **Datation rigoureuse et non négociable** : Chaque modification de script de code dans `workflow_documentation.md` doit s'accompagner du changement immédiat de la date de mise à jour dans le titre de la section (`📅 Dernière version : DD mois YYYY`) et dans l'en-tête du bloc de code JavaScript lui-même (`// DERNIÈRE MISE À JOUR : DD mois YYYY`). Utilise la date actuelle du système (ex: `29 mai 2026`).
3. **Zéro troncature** : Ne jamais abréger les scripts de code par des commentaires comme `// ... reste du code` ou `// logique existante`. Les blocs de code dans `workflow_documentation.md` doivent être fonctionnels, complets et directement copiables-collables par l'utilisateur.
4. **Cohérence croisée** : Si une modification technique (ex: l'ajout d'une règle d'exclusion de podium) impacte l'agrégation et le rendu final, mets à jour :
   - `workflow_documentation.md` (le script JavaScript modifié du nœud concerné).
   - `memory.MD` (la sous-section "Moteur d'Exclusion" dans "Logique métier & JavaScript").
   - `exemple_rapport_slack.md` (pour s'assurer que le rapport d'exemple montre bien l'exclusion en action et un rendu propre).
5. **Rapport final** : À la fin de chaque intervention de modification de workflow, présente un résumé clair listant de manière transparente les fichiers mis à jour et confirmant que toutes les dates de versioning de nœuds ont été incrémentées à la date du jour.
