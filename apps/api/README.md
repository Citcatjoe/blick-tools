# Blick Tools API (`apps/api`)

API serveur à serveur, déployée sur Cloud Run. Premier appelant : backend **Hub Rédaction**.

- Contrat : [`specs/001-poll-create-api/contracts/openapi.yaml`](../../specs/001-poll-create-api/contracts/openapi.yaml)
- Spec, décisions, modèle : [`specs/001-poll-create-api/`](../../specs/001-poll-create-api/)
- Documents produits par la même fabrique que le dashboard : [`@rms/widget-model`](../../packages/widget-model/)

## `POST /polls` en bref

```http
POST /polls
Authorization: Bearer <ID token Google du compte de service appelant>
Content-Type: application/json
Idempotency-Key: article-4711-poll          (optionnel, recommandé)

{ "question": "…", "answers": ["Oui", "Non"], "theme": "Suisse", "brand": "blick", "author": "jane.doe@ringier.ch" }
```

→ `201 { "id": "…", "embedUrl": "…/bl-tools-client-poll/?pollDoc=…&brand=blick" }`
(`200` + `Idempotent-Replayed: true` si rejeu). Erreurs : `application/problem+json`, champ `code`
stable (`VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`,
`UNAVAILABLE`…).

Lecture et correction (même auth, même liste blanche) :

```http
GET   /polls/{id}    → { id, embedUrl, question, answers: [{ id, text, votes }], totalVotes, theme, brand }
PATCH /polls/{id}    → { question?, answers?: [{ id, text }], editor } ; textes seuls, votes jamais écrits
```

## Développement

```bash
npm install            # à la racine
npm run test:api       # contrat HTTP (store en mémoire, client OIDC factice)
npm run test:widget-model
npm run dev:api        # nécessite les variables ci-dessous ; sans identifiants GCP, seules
                       # les erreurs avant écriture (401/403/400…) sont observables
```

## Configuration (variables d'environnement, toutes obligatoires)

| Variable | Exemple | Rôle |
|---|---|---|
| `API_AUDIENCE` | `https://blick-tools-api-704592955335.europe-west1.run.app` | Audience attendue dans l'ID token = URL du service |
| `ALLOWED_CALLERS` | `hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com` | Liste blanche d'e-mails, séparés par des virgules |
| `CLIENT_BASE_URL` | prod : `https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-client-` · test : `https://www.prod.storytelling.blick.ch/fr/_sandbox/blick-tools-test-env/bl-tools-client-` | Base des `embedUrl` (même valeur que `VITE_CLIENT_BASE_URL` de l'environnement) |
| `PORT` | fourni par Cloud Run | |

Le service refuse de démarrer si l'une manque. Il n'y a **aucun** fallback vers la production. Le
projet Firestore est celui du service Cloud Run (identifiants par défaut, pas de clé JSON). À
l'exécution, le service ne lit pas le `.env` racine : ses valeurs sont figées au déploiement, à
partir du `.env` de l'environnement de destination (voir *Déploiement*).

## Mise en place (une fois par projet, par un propriétaire)

Projets : test `blick-tools-app`, production `blick-tools-app-42a99` (se fier à l'**identifiant**,
cf. `n8n_workflows/acces_firestore.md`). Les deux sont sur le plan Blaze (confirmé le 2026-11-09).

```bash
P=$(grep '^VITE_FIREBASE_PROJECT_ID=' .env | cut -d= -f2-)   # .env = copie de .env-test ou .env-prod
export CLOUDSDK_ACTIVE_CONFIG_NAME=$([ "$P" = blick-tools-app-42a99 ] && echo blick-prod || echo blick-test)
R=europe-west1   # au plus près de Firestore (eur3 = Belgique + Pays-Bas)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project $P
gcloud artifacts repositories create blick-tools --repository-format=docker --location=$R --project $P
```

Compte de service de l'API : `api-blicktools-ecriture@<projet>.iam.gserviceaccount.com`, rôle
*Utilisateur Cloud Datastore* uniquement, sans clé (créé dans la console ; jamais
`firebase-adminsdk-*`).

Appelant autorisé : `hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com` (compte dédié
du backend Hub Rédaction, communiqué le 2026-11-09).

## Déploiement

Même convention que les apps Vite : copier `.env-test` ou `.env-prod` vers `.env` selon la
destination, **vérifier lequel est actif**, puis, depuis la racine du monorepo. Seuls 33 fichiers
partent vers Cloud Build (`.gcloudignore` racine : manifestes npm, `packages/widget-model`,
`apps/api/src`) ; aucun `.env`, `.git` ni code front. Contrôle : `gcloud meta list-files-for-upload .`

```bash
P=$(grep '^VITE_FIREBASE_PROJECT_ID=' .env | cut -d= -f2-)
BASE=$(grep '^VITE_CLIENT_BASE_URL=' .env | cut -d= -f2-)
export CLOUDSDK_ACTIVE_CONFIG_NAME=$([ "$P" = blick-tools-app-42a99 ] && echo blick-prod || echo blick-test)
R=europe-west1
HUB=hub-backend@rms-leserreporter-romandie.iam.gserviceaccount.com
CALLERS=$HUB          # en test seulement : CALLERS=$HUB,api-smoke-caller@$P.iam.gserviceaccount.com
NUM=$(gcloud projects describe $P --format 'value(projectNumber)')
AUDIENCE=https://blick-tools-api-$NUM.$R.run.app
IMAGE=$R-docker.pkg.dev/$P/blick-tools/blick-tools-api:$(date +%Y%m%d-%H%M%S)
echo "Projet $P — embedUrl $BASE — appelants $CALLERS"   # dernier contrôle avant d'écrire

# 1. Construire et pousser l'image (Cloud Build)
gcloud builds submit --project $P --config apps/api/cloudbuild.yaml --substitutions=_IMAGE=$IMAGE

# 2. Déployer (avec tes droits de propriétaire)
gcloud run deploy blick-tools-api --project $P --region $R --image $IMAGE \
  --service-account api-blicktools-ecriture@$P.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars "^##^API_AUDIENCE=$AUDIENCE##ALLOWED_CALLERS=$CALLERS##CLIENT_BASE_URL=$BASE"

# 3. Autoriser le Hub à invoquer le service (en plus de la liste blanche applicative)
gcloud run services add-iam-policy-binding blick-tools-api --project $P --region $R \
  --role roles/run.invoker --member serviceAccount:$HUB
```

Le Hub demande son jeton pour `$AUDIENCE` (l'URL déterministe `blick-tools-api-<numéro>.<région>.run.app`)
et appelle cette même URL. Cloud Run expose aussi une URL `…-<hash>-…a.run.app` : un jeton émis pour
celle-ci est refusé (`401`).

## Côté Hub Rédaction

Brief d'intégration complet (environnements, jeton, contrat, erreurs, règle `Idempotency-Key`,
recette) : [`specs/001-poll-create-api/integration-hub.md`](../../specs/001-poll-create-api/integration-hub.md).

## Vérification après déploiement

`specs/001-poll-create-api/quickstart.md` §3.
