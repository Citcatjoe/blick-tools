# Quickstart: valider `POST /polls`

Contrat : [contracts/openapi.yaml](./contracts/openapi.yaml). Modèle : [data-model.md](./data-model.md).

## 1. Local, sans GCP

Prérequis : Node ≥ 22, `npm install` à la racine.

```bash
npm run test:widget-model   # validation, transformation, URL d'embed
npm run test:api            # contrat HTTP : 201/200/400/401/403/409/413/415/503
```

Attendu : tous les tests passent. Les tests de l'API injectent un store Firestore en mémoire et
un client OIDC factice ; la logique de liste blanche, de validation et d'idempotence est la
vraie.

Démarrage à froid, configuration incomplète (FR-014) :

```bash
npm run start -w apps/api
# → sortie en erreur : "Configuration invalide : API_AUDIENCE, ALLOWED_CALLERS, CLIENT_BASE_URL …"
```

Vérificateur OIDC réel, jeton bidon → `401` :

```bash
API_AUDIENCE=http://localhost:8080 ALLOWED_CALLERS=hub@example.iam.gserviceaccount.com \
CLIENT_BASE_URL=https://www.prod.storytelling.blick.ch/fr/_sandbox/blick-tools-test-env/bl-tools-client- \
GOOGLE_CLOUD_PROJECT=blick-tools-app npm run start -w apps/api &
curl -i -X POST localhost:8080/polls -H 'Authorization: Bearer abc' \
  -H 'Content-Type: application/json' -d '{}'
# → 401, WWW-Authenticate: Bearer, {"code":"UNAUTHENTICATED",…}
```

## 2. Dashboard (non-régression US4)

```bash
npm run lint -w apps/backend
npm run dev:backend   # .env actif = .env-test !
```

1. Créer un sondage sans rubrique → « Rubrique » surlignée. Question « ␣␣␣ » → « Question du
   sondage » surlignée. Une réponse vide → « Réponse N » surlignée.
2. Créer un sondage valide, voter dans l'app `poll`, l'éditer (réordonner les réponses) → votes
   conservés.
3. Bouton « copier » → URL `…bl-tools-client-poll/?pollDoc=<id>&brand=<brand>`.

## 3. Environnement de test GCP (après déploiement, cf. `apps/api/README.md`)

Appelant de recette, **en test uniquement** : compte `api-smoke-caller@blick-tools-app` (sans rôle
ni clé), ajouté à `ALLOWED_CALLERS` du déploiement de test et autorisé à invoquer le service. Il
faut s'accorder *Créateur de jetons du compte de service* sur ce compte : le rôle Propriétaire ne
permet pas d'émettre de jeton pour un compte de service.

```bash
P=blick-tools-app; R=europe-west1; export CLOUDSDK_ACTIVE_CONFIG_NAME=blick-test
URL=https://blick-tools-api-$(gcloud projects describe $P --format 'value(projectNumber)').$R.run.app
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account=api-smoke-caller@$P.iam.gserviceaccount.com \
  --audiences="$URL" --include-email)
curl -s -X POST "$URL/polls" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: qs-001' \
  -d '{"question":"Test API ?","answers":["Oui","Non"],"theme":"Suisse"}'
# → 201 {"id":"…","embedUrl":"…?pollDoc=…&brand=blick"}
# Rejouer la même commande → 200, en-tête Idempotent-Replayed: true, même id.
```

Ouvrir `embedUrl` : le sondage s'affiche et compte un vote. Il apparaît dans le dashboard de
test, auteur « Hub Rédaction ». Le supprimer ensuite depuis le dashboard.

### Lire et corriger (mêmes variables `URL`/`TOKEN`)

```bash
ID=<id renvoyé par le POST>
curl -s "$URL/polls/$ID" -H "Authorization: Bearer $TOKEN"
# → {"id":"…","embedUrl":"…","question":"…","answers":[{"id":"…","text":"Oui","votes":1},…],"totalVotes":1,"theme":"Suisse","brand":"blick"}

# Récupérer les ids des réponses pour le PATCH (le texte change, pas les ids)
A1=$(curl -s "$URL/polls/$ID" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).answers[0].id')
A2=$(curl -s "$URL/polls/$ID" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).answers[1].id')
curl -s -X PATCH "$URL/polls/$ID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"editor\":\"recette@blicktools.ch\",\"answers\":[{\"id\":\"$A1\",\"text\":\"Oui (corrigé)\"},{\"id\":\"$A2\",\"text\":\"Non\"}]}"
# → 200, même ids, votes inchangés.
```
