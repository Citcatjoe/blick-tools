// Publie firebase/dev/firestore.rules sur le projet de dev privé `blick-tools-app`.
// La CLI Firebase du dépôt s'authentifie avec le compte Ringier, qui n'a pas accès à ce
// projet : on passe donc par l'API Firebase Rules avec le compte propriétaire
// (cesargreppin@gmail.com). Vérifier d'abord : npm run rules:check:dev
//
// Usage : node firebase/publish-rules-dev.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'blick-tools-app';
const ACCOUNT = 'cesargreppin@gmail.com';
const root = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(root, 'dev', 'firestore.rules'), 'utf8');
const token = execFileSync('gcloud', ['auth', 'print-access-token', `--account=${ACCOUNT}`], { encoding: 'utf8' }).trim();
const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };
const api = 'https://firebaserules.googleapis.com/v1';

async function call(method, url, body) {
  const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  const json = await res.json();
  if (json.error) throw new Error(`${method} ${url} : ${json.error.message}`);
  return json;
}

const ruleset = await call('POST', `${api}/projects/${PROJECT}/rulesets`, {
  source: { files: [{ name: 'firestore.rules', content }] },
});
const release = `projects/${PROJECT}/releases/cloud.firestore`;
await call('PATCH', `${api}/${release}`, { release: { name: release, rulesetName: ruleset.name } });
console.log(`✓ ${release} → ${ruleset.name}`);
