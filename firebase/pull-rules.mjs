// Récupère les règles Firestore et Storage réellement déployées sur un projet et
// les écrit dans firebase/<env>/{firestore,storage}.rules. À lancer avant toute
// modification si les règles ont pu être éditées dans la console :
// `firebase deploy` remplace le ruleset entier, un fichier local périmé
// écraserait ces changements.
//
// Usage : node firebase/pull-rules.mjs <alias .firebaserc>   (ex. prod)
// Authentification : configuration gcloud `blick-<alias>` (cf. apps/api/README.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const alias = process.argv[2];
const projectId = JSON.parse(readFileSync(join(root, '.firebaserc'), 'utf8')).projects[alias];
if (!projectId) {
  console.error(`Alias inconnu dans firebase/.firebaserc : ${alias ?? '(aucun)'}`);
  process.exit(1);
}

const token = execFileSync(
  'gcloud',
  ['auth', 'print-access-token', `--configuration=blick-${alias}`],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
).trim();

async function rulesApi(path) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}\n${await res.text()}`);
  return res.json();
}

// Une release par service : `cloud.firestore`, `firebase.storage/<bucket>`.
// firebase.<env>.json ne cible que le bucket par défaut (le seul utilisé).
const FILES = { 'cloud.firestore': 'firestore.rules', 'firebase.storage': 'storage.rules' };
const { releases = [] } = await rulesApi(`projects/${projectId}/releases`);
for (const release of releases) {
  const service = release.name.split('/releases/')[1].split('/')[0];
  const file = FILES[service];
  if (!file) continue;
  const ruleset = await rulesApi(release.rulesetName);
  const out = join(root, alias, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, ruleset.source.files[0].content);
  console.log(`${release.name} → ${out} (déployé le ${release.updateTime})`);
}
