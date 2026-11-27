# Environnements Firebase, builds et déploiement

> État au 2026-11-20. À mettre à jour à chaque changement d'environnement.

## Projets

| Environnement | Projet Firebase | Compte propriétaire | Firestore | Fichier d'env | Build |
|---|---|---|---|---|---|
| **test** (« dev ») | `widget-studio-test` (n° 1058200385938) | organisation Ringier (cesar.greppin@ringier.ch propriétaire), Blaze sur `01A933-246317-67E963` | europe-west6 | `.env-test` | `dist-dev` |
| **prod** | `blick-tools-app-42a99` (n° 273916803061) | cesar.greppin@ringier.ch, facturation `01A933-246317-67E963` | eur3 | `.env-prod` | `dist-prod` |

⚠️ La console Google Cloud affiche le projet de prod sous le *nom* « blick-tools-app » : toujours se
fier à l'identifiant, qui porte le suffixe `-42a99`.

## Fichiers d'environnement (racine, ignorés par git)

- `.env-test` : projet `widget-studio-test`. Utilisé par les builds `dist-dev`.
- `.env-prod` : projet de prod. Utilisé par les builds `dist-prod`.
- `.env` : copie de `.env-test` ou `.env-prod`. Ne sert qu'aux serveurs de dev
  (`npm run dev:<app>`) et au déploiement de l'API (`apps/api/README.md`). **Les builds l'ignorent.**

## Builds : toujours test + prod

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
Storage (l'ancien `upload.php` et son dossier `_uploads` sont supprimés).

**oEmbed** (`oembed/oembed.php`, pour Tickaroo) : déposé dans `…/__is_embed_somewhere/bl-tools-oembed/`
(un seul exemplaire, sert la prod et le test). Mal placé jusqu'au 2026-11-20 (404) ; vérifié ce jour :
widget prod et widget de test `…/widget-studio-test/…` → 200 `type: rich`, autre hôte → 404.

## API serveur (Hub Rédaction, extension Chrome)

- Test (`BLICK_TOOLS_API_URL_STAGE` de `hub-backend`) : service Cloud Run `blick-tools-api` sur
  `widget-studio-test`, en `europe-west6` (`https://blick-tools-api-1058200385938.europe-west6.run.app`),
  déployé le 2026-11-20 ; calendriers, tinders et quiz (spec 002) ajoutés et recettés le 2026-11-26
  (`STORAGE_BUCKET=widget-studio-test.firebasestorage.app`, rôle `storage.objectAdmin` du compte
  `api-blicktools-ecriture` sur ce seul bucket). Appelants : `hub-backend@rms-leserreporter-romandie`
  et `api-smoke-caller@widget-studio-test` (recette). Spec 003 (règles du dashboard, `POST /images`)
  déployée et recettée le 2026-11-27 (révision `blick-tools-api-00006-4zr`, commit `32666a2`).
  Spec 004 (`GET /widget-types`) : révision `00007-td5`. Spec 005 (teasers, dossiers, NatiNotes,
  joueur·euse du match, faits marquants, `GET /teams`) déployée le 2026-11-27 (révision
  `blick-tools-api-00008-vst`, commit `406c802` ; retour arrière : `00007-td5`), contrôlée sans écriture
  (description à 9 formats, effectifs lus, demandes incomplètes refusées sur le bon champ).
- Prod (`BLICK_TOOLS_API_URL_PROD` de `hub-backend`) : service Cloud Run `blick-tools-api` sur
  `blick-tools-app-42a99` (`https://blick-tools-api-273916803061.europe-west1.run.app`), déployé le
  2026-11-19 ; calendriers, tinders et quiz (spec 002) déployés le 2026-11-26 (révision
  `blick-tools-api-00002-mns`, `STORAGE_BUCKET=blick-tools-app-42a99.firebasestorage.app`, rôle
  `storage.objectAdmin` sur ce seul bucket). Appelant unique : `hub-backend@rms-leserreporter-romandie`
  (pas de compte de recette : première vérification réelle par le Hub). Spec 003 déployée le
  2026-11-27 (révision `blick-tools-api-00003-z9k`, commit `32666a2` ; retour arrière : `00002-mns`).
- Envois d'images `POST /images` : préfixe `hub-uploads/` des deux buckets, supprimé après 7 jours
  par une règle de cycle de vie (`apps/api/storage-lifecycle.json`, posée le 2026-11-27 ; seule règle
  des buckets).
- Procédure de déploiement : `apps/api/README.md` (variable `STORAGE_BUCKET` obligatoire depuis la
  spec 002).

## Règles de sécurité et connexion

| Commande | Projet | Fichier |
|---|---|---|
| `npm run rules:check:prod` / `rules:check:test` | prod / test | vérifie le fichier local contre 26 cas simulés (API Rules test), sans rien publier |
| `npm run rules:deploy:prod` | `blick-tools-app-42a99` (alias `prod`) | `firebase/prod/*.rules` (vérification puis CLI Firebase) |
| `npm run rules:deploy:test` | `widget-studio-test` (alias `test`) | `firebase/test/*.rules` (vérification puis CLI Firebase) |

Avant toute modification : `npm run rules:pull:prod` (la console a pu être éditée). Les règles de test
reprennent celles de la prod pour `widgets`, `teams`, `embeds` : toute modification en prod se reporte
dans `firebase/test/firestore.rules` (et inversement).

**Depuis le 2026-11-19 (prod ; test depuis le 2026-11-20) :**
- **Anonyme** (widgets dans les articles) : lecture des widgets, compteurs de `stats`, dépôt d'un message
  de témoignage. Les messages ne sont plus lisibles publiquement (audit S1 corrigé).
- **Vote « joueur·euse du match » (2026-11-27)** : la règle exigeait `stats.totalVotes` + 1, champ que
  l'app n'écrit plus depuis la structure `widgets` (app potm, 2026-08-17) : tout vote anonyme était
  refusé (audit S5). Un vote = un seul candidat touché dans `stats.playersVotes`. Publié par l'API
  Firebase Rules, Firestore seulement (Storage inchangé) : test `855bfd93…` (retour arrière
  `548cd0d9…`), prod `ad20bdbd…` (retour arrière `b9eba71a…`). Vérifié en test par un vrai vote anonyme
  (accepté) et un vote sur deux candidats (refusé).
- **Membre** (`isMember()`) : tout le reste. Membre = adresse `@ringier.ch` **vérifiée** (connexion
  Google) ou l'un des comptes à mot de passe existants, cités par uid dans les règles (7 en prod, 3 en
  test). Un compte connecté qui n'est pas membre n'a aucun droit : l'inscription étant ouverte (exigée
  par la connexion Google) et la clé API publique, c'est ce qui ferme la porte (audit S2).
- **Nouvel accès** : un collègue `@ringier.ch` se connecte avec Google, rien à préparer. Un compte à
  mot de passe hors Ringier : le créer dans la console, puis ajouter son uid à `isMember()`.
- Quand un compte de la liste s'est connecté une fois par Google (même uid, adresse vérifiée), il peut
  en sortir.

**Connexion Google du Studio** (`apps/backend/src/components/Login/auth.js`, modèle prizewatch) :
paramètre `hd: 'ringier.ch'`, déconnexion de toute session Google hors domaine, mot de passe replié.
Réglages console :

| Réglage | Test (`widget-studio-test`) | Prod (`blick-tools-app-42a99`) |
|---|---|---|
| Fournisseur Google | activé le 2026-11-20 | activé le 2026-11-19 |
| Inscription | ouverte (requise) | ouverte (requise) |
| Domaines autorisés | `www.prod.storytelling.blick.ch` ajouté le 2026-11-20 | `storytelling.blick.ch`, `www.prod.storytelling.blick.ch` |
| Clé API « Browser key » : référents | `*.blick.ch`, `localhost`, `widget-studio-test.firebaseapp.com` | `*.blick.ch`, `localhost`, `blick-tools-app-42a99.firebaseapp.com` |

## Historique de l'environnement de test

- Jusqu'au 2026-11-20 : projet privé `blick-tools-app` (compte cesargreppin@gmail.com), qui
  hébergeait aussi des projets perso. Un essai sur `sidekick-test-3ab83` (17-19 novembre) a été
  abandonné : projet supprimé par l'IT, son nom ne correspondant plus à l'application.
- 2026-11-20 : migration vers `widget-studio-test` (35 documents, 23 images et 3 comptes copiés et
  vérifiés ; URL d'images réécrites vers le nouveau bucket), bascule de `.env-test`, dossier FTP
  `blick-tools-test-env` renommé `widget-studio-test`, API de test redéployée et `hub-backend`
  rebranché, recette par César (création, détection et modification depuis l'extension). Scripts de
  migration : commit `cf4c8af` (supprimés ensuite).
- 2026-11-20 : `blick-tools-app` supprimé (récupérable jusqu'au ~2026-12-20 :
  `gcloud projects undelete blick-tools-app --account=cesargreppin@gmail.com`). Son API de test avait
  été supprimée avant ; le jeu « Mahault 8 ans » (`mahault8y`) vit désormais dans son propre projet
  `mahault-8y-intruder` ; prizewatch était déjà sur `prizewatch-82de7`.

## Reste à faire

- **Extension Chrome** : PR #23 `fix/widget-studio-test` → `develop` (chemins de test en
  `…/widget-studio-test/`) à faire fusionner par le responsable du Hub, puis publier.
- Retirer de `isMember()` les comptes à mot de passe une fois passés à Google (voir « Règles de
  sécurité et connexion »).
