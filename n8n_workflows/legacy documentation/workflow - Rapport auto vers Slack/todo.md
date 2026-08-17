# 📋 Liste des Améliorations Futures (TODO)

Ce fichier répertorie les pistes d'optimisation, les idées d'évolutions fonctionnelles et les ajustements techniques à apporter au workflow automatique de reporting Blick Tools MegaMind.

---

## 💡 Idées d'Optimisations & Évolutions

### 1. Exclusion des widgets trop récents du classement "Flop 3"
* **Problématique** : 
  Un widget créé en toute fin de mois (le jour même ou la veille du rapport) dispose d'un temps d'exposition extrêmement court au moment de la génération du rapport (le dernier jour à 09h00). Même s'il s'agit d'un excellent widget qui va cartonner par la suite, il apparaîtra au moment M avec un engagement de 0 ou proche de 0. Cela le fait atterrir injustement dans le classement **Flop 3**, créant du bruit analytique infondé.
  
* **Piste de solution** :
  * Ajouter un filtre de sécurité au niveau du nœud **Cuisine** ou **Final report gen** pour exclure des classements (Tops/Flops) tout widget ayant une durée de vie (`jours_actifs`) strictement inférieure à un certain seuil (ex: `< 2 jours` ou `< 48 heures`).
  * Ces widgets resteraient comptabilisés dans le volume global de production (Instant T) et ventilés dans les rubriques, mais seraient ignorés lors du tri des podiums afin de ne mesurer que de réels succès ou échecs éditoriaux.

* **Statut** : ❌ **Abandonné (17 août 2026)** — sans objet depuis la refactorisation. Le rapport ne comporte plus de classement **Flop 3**, uniquement le Top 5 de l'engagement : un widget trop récent ne peut donc plus être exposé injustement. Décision de César, à ne pas rouvrir.

---

## 🛠️ Améliorations Techniques du Workflow

- [ ] **Automatisation du gras Slack** : Rendre le nœud d'assemblage encore plus robuste pour forcer automatiquement les syntaxes de mise en gras Slack (`*texte*`) sur les retours de l'IA si celle-ci oublie parfois de les appliquer.
- [ ] **Ajustement dynamique du seuil d'efficacité** : Remplacer l'indice d'efficacité par une moyenne glissante sur 3 mois pour lisser les variations saisonnières importantes de trafic (périodes creuses vs événements majeurs).
