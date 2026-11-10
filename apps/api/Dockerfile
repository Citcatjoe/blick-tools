# Contexte de build : RACINE du monorepo (cf. cloudbuild.yaml), filtré par Dockerfile.dockerignore
# (manifestes npm + packages/widget-model + apps/api uniquement).
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /srv

# Lockfile racine + manifestes de tous les workspaces : `npm ci` exige qu'ils concordent.
COPY . .
# chmod : les droits du poste de dev sont copiés tels quels (ex. dossiers en 700) ; l'utilisateur
# `node` doit pouvoir lire le code, sans pouvoir le modifier (fichiers à root).
RUN npm ci --omit=dev --workspace apps/api --no-audit --no-fund \
 && npm cache clean --force \
 && chmod -R a+rX,go-w /srv

WORKDIR /srv/apps/api
USER node
CMD ["node", "src/server.js"]
