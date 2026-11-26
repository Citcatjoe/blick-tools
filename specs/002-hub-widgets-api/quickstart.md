# Quickstart: valider calendriers, tinders et quiz

## 1. Local

```bash
npm run test:widget-model   # règles et documents des 3 formats (+ sondage)
npm run test:api            # contrat HTTP : 201/200/400/401/403/404 par format, images, idempotence
```

## 2. Dashboard (non-régression)

`npm run dev:backend` (`.env` = `.env-test`) : créer puis éditer un calendrier, un tinder et un
quiz ; erreurs surlignées comme avant (rubrique, titre, date, carte, question, réponse correcte,
conclusions) ; un quiz créé a un id sur chaque question et `stats.statsQuestions` en objet.

## 3. Environnement de test (après déploiement, cf. `apps/api/README.md`)

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=blick-test
P=widget-studio-test; R=europe-west6
URL=https://blick-tools-api-$(gcloud projects describe $P --format 'value(projectNumber)').$R.run.app
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account=api-smoke-caller@$P.iam.gserviceaccount.com \
  --audiences="$URL" --include-email)
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

curl -s -X POST "$URL/calendars" "${H[@]}" -d '{"title":"Recette","theme":"Sport",
  "dates":[{"text":"Finale","start":"2026-12-20T20:45"}]}'
curl -s -X POST "$URL/tinders" "${H[@]}" -d '{"label":"Recette","title":"Oui ou non ?","theme":"Suisse",
  "cards":[{"label":"Carte","title":"Première"}]}'
curl -s -X POST "$URL/quizzes" "${H[@]}" -d '{"title":"Recette","theme":"Inter",
  "questions":[{"text":"2+2 ?","img":"https://<image publique>",
    "answers":[{"text":"3"},{"text":"4","isCorrect":true},{"text":"5"},{"text":"22"}]}],
  "conclusion":{"text1":"Raté","text2":"Pas mal","text3":"Bravo"}}'
curl -s "$URL/quizzes/<id>" -H "Authorization: Bearer $TOKEN"
```

Attendu : `201` ; l'heure de la finale s'affiche 20:45 dans l'iframe ; l'image du quiz est servie
depuis `firebasestorage.googleapis.com/v0/b/widget-studio-test.firebasestorage.app/…quizs%2F…` ;
un swipe et une partie de quiz sont comptés ; les trois widgets s'ouvrent dans le dashboard de
test (`?edit=<id>`). Supprimer ensuite les widgets de recette.
