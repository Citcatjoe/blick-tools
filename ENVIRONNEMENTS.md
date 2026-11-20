# Environnements Firebase, builds et migration vers widget-studio-test

> État au 2026-11-20. À mettre à jour à chaque changement d'environnement.

## Situation actuelle

Depuis le 2026-11-20, l'environnement hors prod (« dev » / « test ») est le projet Ringier
`widget-studio-test`. `.env-test` le vise, les `dist-dev` sont construits dessus et en ligne dans
`…/fr/_sandbox/widget-studio-test/`. Reste l'URL de l'API de test côté Hub (voir « Migration »).
Le projet privé `blick-tools-app` n'est plus l'environnement de dev ; il garde
ses données (copie d'origine) et héberge toujours `prizewatch` et `mahault8y`.

| Environnement | Projet Firebase | Compte propriétaire | Firestore | Fichier d'env | Build |
|---|---|---|---|---|---|
| **dev / test** | `widget-studio-test` (n° 1058200385938) | organisation Ringier (cesar.greppin@ringier.ch propriétaire), Blaze sur `01A933-246317-67E963` | europe-west6 | `.env-test` | `dist-dev` |
| **prod** | `blick-tools-app-42a99` | facturation `01A933-246317-67E963` | eur3 | `.env-prod` | `dist-prod` |
| ancien dev | `blick-tools-app` | cesargreppin@gmail.com (privé) | eur3 | `.env-test-blick-tools-app` | — |

⚠️ La console Google Cloud affiche le projet de prod sous le *nom* « blick-tools-app », qui est aussi
l'*identifiant* de l'ancien projet de dev. Toujours se fier à l'identifiant.

## Fichiers d'environnement (racine, ignorés par git)

- `.env-test` : projet `widget-studio-test`. Utilisé par les builds `dist-dev`.
- `.env-prod` : projet de prod. Utilisé par les builds `dist-prod`.
- `.env-test-blick-tools-app` : ancienne config de dev (projet privé), gardée pour revenir en
  arrière : `mv .env-test .env-test-widget-studio && mv .env-test-blick-tools-app .env-test`.
- `.env` : copie de `.env-test` ou `.env-prod`. Ne sert plus qu'aux serveurs de dev
  (`npm run dev:<app>`) et au déploiement de l'API (`apps/api/README.md`). **Les builds l'ignorent.**

## Builds : toujours dev + prod

```bash
npm run build:<app>      # → apps/<app>/dist-dev (.env-test) et apps/<app>/dist-prod (.env-prod)
```

- Concerne `backend` et les 11 apps clientes (`calendar`, `facts`, `folder`, `natinotes`, `poll`,
  `potm`, `prono`, `quiz`, `teaser`, `testimony`, `tinder`). Script : `scripts/build.mjs`.
- Chaque build reçoit uniquement les variables de son fichier ; le `.env` actif n'a aucun effet.
- Garde-fou : après chaque build, le script vérifie que le bundle cite le bon projet Firebase et pas
  l'autre, sinon il échoue.
- `docs` et `utils` gardent un build simple (`dist`) : `docs` n'utilise pas Firebase, `utils`
  (migration) a besoin des deux bases à la fois.
- Les anciens dossiers `dist/` des apps sont des restes des builds précédents : ne plus les déployer.

**Déploiement FTP** : `dist-dev` va dans le dossier de test
(`…/fr/_sandbox/widget-studio-test/bl-tools-client-<app>`, Studio dans `…/widget-studio-test/backend/`),
`dist-prod` dans le dossier de prod (`…/fr/__is_embed_somewhere/bl-tools-client-<app>`, Studio dans
`…/bl-tools-backend/`). Aucun PHP n'est déployé avec les apps : les images passent par Firebase
Storage (l'ancien `upload.php` et son dossier `_uploads` sont obsolètes).

**oEmbed** (`oembed/oembed.php`, pour Tickaroo) : déposé dans `…/__is_embed_somewhere/bl-tools-oembed/`
(un seul exemplaire, sert la prod et le test). Mal placé jusqu'au 2026-11-20 (404) ; vérifié ce jour :
widget prod et widget de test `…/widget-studio-test/…` → 200 `type: rich`, autre hôte → 404.

## API serveur (Hub Rédaction, extension Chrome)

- Test (Hub `BLICK_TOOLS_API_URL_STAGE`) : service Cloud Run `blick-tools-api` sur `widget-studio-test`, en `europe-west6`
  (`https://blick-tools-api-1058200385938.europe-west6.run.app`), déployé le 2026-11-20.
- Ancien dev : service `blick-tools-api` sur `blick-tools-app`
  (`https://blick-tools-api-704592955335.europe-west1.run.app`). Plus appelé par le Hub depuis le
  2026-11-20 (`BLICK_TOOLS_API_URL_STAGE` de `hub-backend` passée à l'API de test, révision `00016`,
  même image) ; service supprimé le 2026-11-20 (l'image reste dans Artifact Registry du projet).
- Prod : service Cloud Run `blick-tools-api` sur `blick-tools-app-42a99`, déployé le 2026-11-19
  (`https://blick-tools-api-273916803061.europe-west1.run.app`, révision `00001`, image
  `blick-tools-api:20261119-103945`). Appelant unique : `hub-backend@rms-leserreporter-romandie`.
  Côté Hub, `BLICK_TOOLS_API_URL_PROD` est à renseigner sur `hub-backend` (session extension) ; tant
  qu'elle est vide, Ring prod répond « pas encore branché ».
- Procédure de déploiement : `apps/api/README.md`.

## Règles de sécurité et connexion

| Commande | Projet | Fichier |
|---|---|---|
| `npm run rules:check:prod` / `rules:check:test` / `rules:check:dev` | prod / test / ancien dev | vérifie le fichier local contre 22 cas simulés (API Rules test), sans rien publier |
| `npm run rules:deploy:prod` | `blick-tools-app-42a99` | `firebase/prod/*.rules` (vérification puis CLI Firebase) |
| `npm run rules:deploy:test` | `widget-studio-test` (alias `test`) | `firebase/test/*.rules` (vérification puis CLI Firebase) |
| `npm run rules:deploy:dev` | `blick-tools-app` (ancien dev, privé) | `firebase/dev/firestore.rules` (vérification puis API, compte cesargreppin@gmail.com) |

Avant toute modification : `npm run rules:pull:prod` (la console a pu être éditée). Les règles de test
(et de l'ancien dev) reprennent celles de la prod pour `widgets`, `teams`, `embeds` : toute modification
en prod se reporte dans `firebase/test/firestore.rules` et `firebase/dev/firestore.rules` (et inversement).

**Depuis le 2026-11-19 (prod et dev ; test depuis le 2026-11-20) :**
- **Anonyme** (widgets dans les articles) : lecture des widgets, compteurs de `stats`, dépôt d'un message
  de témoignage. Les messages ne sont plus lisibles publiquement (audit S1 corrigé).
- **Membre** (`isMember()`) : tout le reste. Membre = adresse `@ringier.ch` **vérifiée** (connexion
  Google) ou l'un des comptes à mot de passe existants, cités par uid dans les règles (7 en prod, 3 en
  test et en ancien dev, mêmes uid). Un compte connecté qui n'est pas membre n'a aucun droit : l'inscription étant ouverte (exigée
  par la connexion Google) et la clé API publique, c'est ce qui ferme la porte (audit S2).
- **Nouvel accès** : un collègue `@ringier.ch` se connecte avec Google, rien à préparer. Un compte à
  mot de passe hors Ringier : le créer dans la console, puis ajouter son uid à `isMember()`.
- Quand un compte de la liste s'est connecté une fois par Google (même uid, adresse vérifiée), il peut
  en sortir.

**Connexion Google du Studio** (`apps/backend/src/components/Login/auth.js`, modèle prizewatch) :
paramètre `hd: 'ringier.ch'`, déconnexion de tout compte Google hors domaine, mot de passe replié.
Réglages console :

| Réglage | Test (`widget-studio-test`) | Prod (`blick-tools-app-42a99`) |
|---|---|---|
| Fournisseur Google | activé le 2026-11-20 | activé le 2026-11-19 |
| Inscription | ouverte (requise) | ouverte (requise) |
| Domaines autorisés | `www.prod.storytelling.blick.ch` ajouté le 2026-11-20 | `storytelling.blick.ch`, `www.prod.storytelling.blick.ch` |
| Clé API « Browser key » : référents | `*.blick.ch`, `localhost`, `widget-studio-test.firebaseapp.com` | `*.blick.ch`, `localhost`, `blick-tools-app-42a99.firebaseapp.com` |

## Migration vers widget-studio-test

Remplace `sidekick-test-3ab83` (préparé du 17 au 19 novembre, supprimé par l'IT le 2026-11-20 car
son nom ne correspondait plus à l'application). Scripts : `firebase/migration-widget-studio-test/`
(source, cible et collections dans `config.mjs` ; lecture source avec cesargreppin@gmail.com,
écriture cible avec cesar.greppin@ringier.ch ; si gcloud demande une réauthentification :
`gcloud auth login <compte>`).

### Préparé et basculé le 2026-11-20

- Projet créé par l'IT dans l'organisation Ringier, Blaze actif (`01A933-246317-67E963`),
  cesar.greppin@ringier.ch propriétaire.
- App web Firebase « Widget Studio (test) » ; config dans `.env-test`.
- Firestore `(default)` en `europe-west6`, protection contre la suppression activée.
- Bucket Storage par défaut `widget-studio-test.firebasestorage.app` en `europe-west6`.
- Règles `firebase/test/*.rules` déployées : celles du dev (donc de la prod) sans les collections
  perso, mêmes uid dans `isMember()` (22/22 cas conformes). Vérifié en ligne : lecture anonyme d'un
  widget 200, lecture anonyme des messages 403, modification anonyme du contenu 403.
- Clé API « Browser key » : référents `localhost`, `*.blick.ch`, `widget-studio-test.firebaseapp.com`.
- Données : 35 documents copiés et contrôlés identiques un par un : 30 widgets (26 visibles dans le
  Studio + 4 supprimés, `meta.deleted`, conservés comme en dev), 1 message de témoignage, 4 teams.
  23 images copiées, 18 URL dans 8 documents réécrites vers le nouveau bucket, 12 URL distinctes
  toutes accessibles. Les données perso de `blick-tools-app` (`mahault8y`, `prizewatch`, 27 images)
  ne sont pas copiées.
- Auth : e-mail/mot de passe et Google activés (console) ; 3 comptes à mot de passe importés avec
  leurs mots de passe et leurs uid (ceux d'`isMember()`) ; domaine autorisé
  `www.prod.storytelling.blick.ch` ajouté. Inscription ouverte (requise par la connexion Google).
- API : service Cloud Run `blick-tools-api` en `europe-west6` (au plus près de Firestore),
  `https://blick-tools-api-1058200385938.europe-west6.run.app`, révision `00001`, image
  `blick-tools-api:20261120-082951`. Compte d'écriture `api-blicktools-ecriture` (datastore.user),
  appelants `hub-backend@rms-leserreporter-romandie` et `api-smoke-caller@widget-studio-test`
  (recette, test uniquement).
- Bascule : données, images et comptes resynchronisés juste avant (aucun changement côté dev) ;
  `.env-test` remplacé (ancien gardé en `.env-test-blick-tools-app`), `.env` aligné dessus ; 12 apps
  reconstruites, garde-fou `✓ dist-dev vise widget-studio-test` partout. Vérifié dans Chrome sur les
  `dist-dev` : le widget poll lit `widget-studio-test`, le Studio affiche le bandeau de test et
  interroge l'Auth du nouveau projet.

⚠️ Les scripts d'écriture de `firebase/migration-widget-studio-test/` écrasent la cible : depuis la
bascule, ils refusent de tourner sans `--ecraser` (ils effaceraient le travail fait en test).

### Reste à faire

1. **Extension Chrome** : PR #23 `fix/widget-studio-test` → `develop` (chemins de stage en
   `…/widget-studio-test/`, 157/157) à faire fusionner par le responsable du Hub, puis publier.

Fait le 2026-11-20 : sauvegarde FTP `________old_before_rename_test_env` supprimée (404) ;
`BLICK_TOOLS_API_URL_STAGE` de `hub-backend` sur `https://blick-tools-api-1058200385938.europe-west6.run.app`,
recette par César (création, détection, modification) ; ancienne API de dev supprimée.

FTP fait le 2026-11-20 : ancien dossier `blick-tools-test-env` renommé en `widget-studio-test`, vidé
(contenu mis de côté puis supprimé) et rempli avec les 12 `dist-dev`. Vérifié en ligne : 12 dossiers
en 200, tous sur `widget-studio-test` ; sondage affiché, Studio avec bandeau de test, connexion
refusée sur mauvais mot de passe par l'Auth du nouveau projet ; `blick-tools-test-env` en 404 ;
aucun `_uploads/upload.php` joignable (test et prod).

### Points ouverts

- Retirer de `isMember()` les comptes à mot de passe une fois passés à Google (voir « Règles de
  sécurité et connexion »).
