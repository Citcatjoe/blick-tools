# Audit des accès Firebase & piste de sortie du coût Firestore

> Constat établi le 17 août 2026. Aucun code applicatif n'a été modifié — ce document est une note de décision.

## Pourquoi ce document

Les Blick Tools tiennent aujourd'hui dans le free tier Firestore à l'échelle de la Suisse romande. Ouvrir l'outil aux collègues alémaniques ferait sauter ce plafond : le pattern actuel coûte **~1 read + 1 write par affichage de widget**, et le free tier est à 50 000 reads / 20 000 writes par jour.

L'objectif n'est pas « zéro franc » mais **un coût borné et prévisible**, insensible à l'audience.

## Constat 1 — la lecture est déjà centralisée

La refactorisation monorepo a fait son travail. **Les onze apps passent par `@rms/services`** et lisent leur document via `fetchWidgetData()`. Aucune app ne va lire Firestore en direct.

C'est le point qui compte le plus : c'est ce chemin qui porte la totalité du trafic lecteur.

## Constat 2 — l'écriture n'est centralisée qu'à moitié

`packages/services/api.js` contient bien les fonctions transactionnelles (`updateQuizStatsTransactional`, `updateTinderCardVotesTransactional`, `updateFactItemVotesTransactional`, `updatePlayerRatingTransactional`…), mais plusieurs apps ont gardé en parallèle des incréments inline.

Décompte des appels Firebase **réellement exécutés** (hors imports morts) :

| App | Appels directs | Note |
|---|---|---|
| `facts`, `quiz`, `tinder` | **0** | Déjà 100 % propres — leur import `runTransaction` est un vestige à supprimer |
| `potm`, `prono` | 1 + 1 (`PronosticWidget`) | |
| `folder`, `teaser` | 2 chacune | |
| `poll` | 3 | Redéfinit localement `incrementCounterViews` (`src/App.jsx:103`) alors que la fonction existe dans `packages/services/analytics.js:49` — **doublon** |
| `testimony` | 3 | |
| `calendar` / `teaser` (Calendar.jsx) | 3 + 2 | Les deux seuls `Calendar.jsx` réellement montés |

**Total : ~18 appels d'écriture sur 7 apps.** Le backend (6 fichiers : Firestore + Auth + Storage) est à traiter à part.

## Constat 3 — du code mort, sans coût

- **9 `Calendar.jsx` jamais montés** (import commenté ou aucune référence) : `backend`, `facts`, `folder`, `poll`, `potm`, `prono`, `quiz`, `testimony`, `tinder`. Seuls ceux de `calendar` et `teaser` sont réellement utilisés.
- **3 imports jamais appelés** : `facts`, `quiz`, `tinder` importent `runTransaction` sans jamais l'invoquer.

⚠️ Ce code mort **ne coûte rien** : un fichier jamais importé n'entre pas dans le bundle Vite, et Rollup élimine les imports nommés inutilisés. C'est du décor, pas de la dette qui grossit. Aucune urgence à le nettoyer.

## Les leviers, indépendants du choix de base

Deux optimisations valent dans **tous** les scénarios, y compris en restant sur Firebase :

1. **Supprimer l'écriture du compteur de vues.** `window.blickDataLayer` compte déjà les `iframe_impression`. Écrire en plus `stats.views` en base est une double comptabilisation, moins fiable et coûteuse. → −50 % d'écritures au minimum.
2. **Mettre un cache CDN devant la lecture** (Cloudflare, gratuit). Le contenu éditorial est identique pour tous les lecteurs, donc cachable. → les reads facturés tombent à quasi zéro.

Avec ces deux leviers seuls, rester sur Firebase redevient probablement viable pour toute la Suisse.

## Les trois atterrissages possibles

| Option | Coût | Effort | Ops / astreinte |
|---|---|---|---|
| **Firebase + les 2 leviers** | 0–30 CHF/mois | Faible | Aucune |
| **Cloudflare D1 + Workers** | 0–5 $/mois | Réécriture de la couche d'accès | Aucune |
| **PocketBase (Docker) sur VPS** | ~12 CHF/mois | Réécriture + migration | **La tienne** |

Notes sur PocketBase : binaire Go unique + SQLite, pas d'image Docker officielle mais images communautaires fiables ; tout l'état vit dans le volume `/pb/pb_data`, donc **Litestream** est obligatoire pour la réplication continue. SQLite n'accepte qu'un seul writer à la fois — sans conséquence ici, les votes représentent 1 à 5 % des lecteurs.

Hébergement : le **VPS Lite Infomaniak** (3 CHF/mois, 500 Mbit/s, trafic illimité) est largement dimensionné en puissance, mais **sans SLA** — Infomaniak le positionne pour le test. Bon pour un pilote, pas pour la prod ; prendre un VPS Cloud (SLA + snapshots) le jour du passage en production.

## Prochaine étape recommandée

Ne rien réécrire tant que la décision n'est pas prise. Le travail de centralisation des 18 appels d'écriture **ne devient utile que si l'on migre** — et il touche des chemins d'écriture (votes, compteurs), où une régression est silencieuse : le widget s'affiche, le lecteur vote, le compteur ne bouge pas. Il n'y a aucune suite de tests dans ce dépôt, donc la seule validation possible est manuelle, widget par widget, contre `.env-test`.

Bon ordre le jour venu :

1. Rapatrier les ~18 appels d'écriture dans `packages/services` (+ supprimer le code mort au passage).
2. Monter un PocketBase ou un Worker en pilote sur **une seule app** (`facts` ou `teaser`, les plus simples) et mesurer pour de vrai.
3. Décider, puis généraliser.
