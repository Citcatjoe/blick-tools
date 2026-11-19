# Environnements Firebase, builds et migration vers sidekick-test

> État au 2026-11-19. À mettre à jour à chaque changement d'environnement.

## Situation actuelle (provisoire)

La migration de l'environnement hors prod vers le projet Ringier `sidekick-test-3ab83` attend le
passage de ce projet au plan Blaze (demandé à l'IT, pas encore fait). **En attendant, l'environnement
de dev reste le projet privé `blick-tools-app`, comme avant.** Rien n'a été basculé : `.env-test`,
les widgets de dev en ligne, l'API de dev et l'extension Chrome visent toujours ce projet.

| Environnement | Projet Firebase | Compte propriétaire | Firestore | Fichier d'env | Build |
|---|---|---|---|---|---|
| **dev** (actuel) | `blick-tools-app` | cesargreppin@gmail.com (privé) | eur3 | `.env-test` | `dist-dev` |
| **prod** | `blick-tools-app-42a99` | facturation `01A933-246317-67E963` | eur3 | `.env-prod` | `dist-prod` |
| **test** (à venir) | `sidekick-test-3ab83` | organisation Ringier (cesar.greppin@ringier.ch propriétaire) | europe-west6 | `.env-test-sidekick` | — |

⚠️ La console Google Cloud affiche le projet de prod sous le *nom* « blick-tools-app », qui est aussi
l'*identifiant* du projet de dev. Toujours se fier à l'identifiant.

## Fichiers d'environnement (racine, ignorés par git)

- `.env-test` : projet de dev (privé). Utilisé par les builds `dist-dev`.
- `.env-prod` : projet de prod. Utilisé par les builds `dist-prod`.
- `.env-test-sidekick` : config prête de `sidekick-test-3ab83`, **pas encore utilisée**.
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

**Déploiement FTP** : `dist-dev` va dans le dossier de dev
(`…/fr/_sandbox/blick-tools-test-env/bl-tools-client-<app>`), `dist-prod` dans le dossier de prod
(`…/fr/__is_embed_somewhere/bl-tools-client-<app>`). Même règle pour le backend.

## API serveur (Hub Rédaction, extension Chrome)

- Dev : service Cloud Run `blick-tools-api` sur `blick-tools-app`, toujours en ligne
  (`https://blick-tools-api-704592955335.europe-west1.run.app`). Inchangé.
- Prod : service Cloud Run `blick-tools-api` sur `blick-tools-app-42a99`, déployé le 2026-11-19
  (`https://blick-tools-api-273916803061.europe-west1.run.app`, révision `00001`, image
  `blick-tools-api:20261119-103945`). Appelant unique : `hub-backend@rms-leserreporter-romandie`.
  Côté Hub, `BLICK_TOOLS_API_URL_PROD` est à renseigner sur `hub-backend` (session extension) ; tant
  qu'elle est vide, Ring prod répond « pas encore branché ».
- Procédure de déploiement : `apps/api/README.md`.

## Règles de sécurité et connexion

| Commande | Projet | Fichier |
|---|---|---|
| `npm run rules:check:prod` / `rules:check:dev` | prod / dev | vérifie le fichier local contre 22 cas simulés (API Rules test), sans rien publier |
| `npm run rules:deploy:prod` | `blick-tools-app-42a99` | `firebase/prod/*.rules` (vérification puis CLI Firebase) |
| `npm run rules:deploy:dev` | `blick-tools-app` (privé) | `firebase/dev/firestore.rules` (vérification puis API, compte cesargreppin@gmail.com) |
| `npm run rules:deploy:test` | **`sidekick-test-3ab83`** (alias `test`) | `firebase/test/*.rules` |

Avant toute modification : `npm run rules:pull:prod` (la console a pu être éditée). Les règles de dev
reprennent celles de la prod pour `widgets`, `teams`, `embeds` : toute modification en prod se reporte
dans `firebase/dev/firestore.rules` (et inversement).

**Depuis le 2026-11-19 (prod et dev) :**
- **Anonyme** (widgets dans les articles) : lecture des widgets, compteurs de `stats`, dépôt d'un message
  de témoignage. Les messages ne sont plus lisibles publiquement (audit S1 corrigé).
- **Membre** (`isMember()`) : tout le reste. Membre = adresse `@ringier.ch` **vérifiée** (connexion
  Google) ou l'un des comptes à mot de passe existants, cités par uid dans les règles (7 en prod, 3 en
  dev). Un compte connecté qui n'est pas membre n'a aucun droit : l'inscription étant ouverte (exigée
  par la connexion Google) et la clé API publique, c'est ce qui ferme la porte (audit S2).
- **Nouvel accès** : un collègue `@ringier.ch` se connecte avec Google, rien à préparer. Un compte à
  mot de passe hors Ringier : le créer dans la console, puis ajouter son uid à `isMember()`.
- Quand un compte de la liste s'est connecté une fois par Google (même uid, adresse vérifiée), il peut
  en sortir.

**Connexion Google du Studio** (`apps/backend/src/components/Login/auth.js`, modèle prizewatch) :
paramètre `hd: 'ringier.ch'`, déconnexion de tout compte Google hors domaine, mot de passe replié.
Réglages console :

| Réglage | Dev (`blick-tools-app`) | Prod (`blick-tools-app-42a99`) |
|---|---|---|
| Fournisseur Google | activé | activé le 2026-11-19 |
| Inscription | ouverte (requise) | ouverte (requise) |
| Domaines autorisés | `www.prod.storytelling.blick.ch` ajouté le 2026-11-19 | `storytelling.blick.ch`, `www.prod.storytelling.blick.ch` |
| Clé API « Browser key » : référents | `*.blick.ch`, `localhost`, `blick-tools-app.firebaseapp.com` | `*.blick.ch`, `localhost`, `blick-tools-app-42a99.firebaseapp.com` |

## Migration vers sidekick-test

### Fait le 2026-11-17

- App web Firebase « Widget Studio (test) » (renommée le 2026-11-19) ; config dans `.env-test-sidekick`.
- Firestore `(default)` en `europe-west6`, protection contre la suppression activée.
- Règles `firebase/test/firestore.rules` déployées (lecture et écriture ouvertes à tous sur
  `widgets` et `teams`, choix du dépôt pour l'environnement de test).
- 34 documents copiés depuis `blick-tools-app` (widgets 26 + 1 message, teams 4, mahault8y 3),
  contrôlés identiques un par un.
- Auth : e-mail/mot de passe et Google activés (console) ; 3 comptes importés avec leurs mots de
  passe ; domaine autorisé `www.prod.storytelling.blick.ch` ajouté. Inscription laissée ouverte
  (la fermer bloquerait la première connexion Google des collègues).
- Vérifié : le widget poll, avec la config sidekick, lit bien `sidekick-test-3ab83`.

### Bloqué : plan Blaze

`sidekick-test-3ab83` n'a pas de compte de facturation (`billingEnabled: false`). Requis pour
Storage, Cloud Run, Cloud Build et Artifact Registry. Demande en cours auprès de l'IT : lier le compte
de facturation de la prod (`01A933-246317-67E963`). Contrôle :

```bash
gcloud billing projects describe sidekick-test-3ab83 --account=cesar.greppin@ringier.ch
```

### Bascule, une fois Blaze actif (dans l'ordre)

Scripts : `firebase/migration-sidekick-test/` (lecture source avec cesargreppin@gmail.com, écriture
cible avec cesar.greppin@ringier.ch ; si gcloud demande une réauthentification :
`gcloud auth login <compte>`).

1. **Données fraîches** : si des widgets ont été créés en dev entre-temps, relancer
   `node copy-firestore.mjs` puis `node verify.mjs` (écrase la cible : uniquement avant la bascule).
2. **Bucket** : console Firebase > Storage > Commencer, emplacement `europe-west6`
   (bucket `sidekick-test-3ab83.firebasestorage.app`).
3. **Règles** : `npm run rules:deploy:test` (Firestore + Storage).
4. **Images** : `node copy-storage.mjs --dry`, puis `node copy-storage.mjs` (50 objets ; 43 URL
   dans 11 documents réécrites vers le nouveau bucket, au 2026-11-17).
5. **Env** : `mv .env-test .env-test-blick-tools-app && mv .env-test-sidekick .env-test`.
   Les builds `dist-dev` viseront alors automatiquement sidekick-test.
6. **Rebuild** des 12 apps et déploiement FTP des `dist-dev`.
7. **API** : suivre `apps/api/README.md` (mise en place + déploiement) avec
   `P=sidekick-test-3ab83` ; nouvelle URL `https://blick-tools-api-237773513315.europe-west1.run.app`
   à communiquer à l'équipe Hub et à reporter dans l'extension Chrome.
8. **Docs** : mettre à jour ce fichier, `apps/api/README.md` (projet de test) et `CLAUDE.md`.

### Points ouverts

- Retirer de `isMember()` les comptes à mot de passe une fois passés à Google (voir « Règles de
  sécurité et connexion »).
- Règles de test ouvertes à tous : à resserrer maintenant que le projet appartient à l'organisation.
