// Migration de l'environnement de test : projet privé `blick-tools-app` → `widget-studio-test`.
// Lecture seule sur la source (compte perso), écriture sur la cible (compte Ringier).
// Si gcloud demande une réauthentification : gcloud auth login <compte>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

export const require = createRequire(new URL('../../package.json', import.meta.url));

export const SRC = { project: 'blick-tools-app', account: 'cesargreppin@gmail.com', bucket: 'blick-tools-app.firebasestorage.app' };
export const DST = { project: 'widget-studio-test', account: 'cesar.greppin@ringier.ch', bucket: 'widget-studio-test.firebasestorage.app' };

// Seules les données du Studio partent chez Ringier. `mahault8y` et `prizewatch`
// (projets perso hébergés sur blick-tools-app) restent sur le projet privé.
export const COLLECTIONS = ['widgets', 'teams', 'embeds'];
export const PERSONAL_PREFIXES = ['mahault8y/', 'prizewatch/'];

export const token = (account) => execSync(`gcloud auth print-access-token --account=${account}`).toString().trim();

export function authClient(account) {
  const { OAuth2Client } = require('google-auth-library');
  const c = new OAuth2Client();
  c.setCredentials({ access_token: token(account) });
  return c;
}

export function firestore({ project, account }) {
  const { Firestore } = require('@google-cloud/firestore');
  return new Firestore({ projectId: project, authClient: authClient(account) });
}

export const DRY = process.argv.includes('--dry');

// Bascule faite le 2026-11-20 : la cible est l'environnement de test en service. Les scripts
// d'écriture l'écraseraient (documents, images, comptes de même identifiant) : il faut le dire.
export function requireOverwrite() {
  if (DRY || process.argv.includes('--ecraser')) return;
  console.error(`${DST.project} est en service depuis la bascule : relancer avec --ecraser pour écraser ses données (ou --dry).`);
  process.exit(1);
}
