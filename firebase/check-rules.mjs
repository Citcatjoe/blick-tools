// Vérifie un fichier de règles Firestore AVANT publication, sans rien déployer ni écrire :
// l'API « Rules test » de Firebase évalue le fichier local contre des requêtes simulées.
//
// Usage : node firebase/check-rules.mjs <prod|test>
// Authentification : gcloud, compte propriétaire du projet (cf. ENVIRONNEMENTS.md).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENVS = {
  prod: {
    project: 'blick-tools-app-42a99',
    account: 'cesar.greppin@ringier.ch',
    legacyUid: 'kcXsca1OdXc5g2jL7IxZS25oMqs1', // compte à mot de passe de la liste (lucie.fehlbaum)
  },
  test: {
    project: 'widget-studio-test',
    account: 'cesar.greppin@ringier.ch',
    legacyUid: 'EXNtznJAddPGUXH8Ix90xyagll33', // test@blicktools.ch
  },
};
const envName = process.argv[2];
const env = ENVS[envName];
if (!env) {
  console.error('Usage : node firebase/check-rules.mjs <prod|test>');
  process.exit(1);
}
const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, envName, 'firestore.rules'), 'utf8');
const token = execFileSync('gcloud', ['auth', 'print-access-token', `--account=${env.account}`], { encoding: 'utf8' }).trim();

const doc = (p) => `/databases/(default)/documents/${p}`;
const NOW = '2026-01-01T00:00:00Z';
// Identités simulées
const anon = null;
const googleRingier = { uid: 'g-ringier', token: { email: 'jane.doe@ringier.ch', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const fakeRingier = { uid: 'p-fake', token: { email: 'faux.compte@ringier.ch', email_verified: false, firebase: { sign_in_provider: 'password' } } };
const googleGmail = { uid: 'g-gmail', token: { email: 'quelquun@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
const legacy = { uid: env.legacyUid, token: { email: 'ancien@exemple.ch', email_verified: false, firebase: { sign_in_provider: 'password' } } };

const widget = { type: 'poll', meta: { title: 'T' }, data: { question: 'Q' }, stats: { views: 1 } };
const message = { email: 'a@b.ch', name: 'A', text: 'Bonjour', timeSent: NOW }; // timeSent == request.time
const potm = { type: 'potm', meta: { id: 'w1' }, data: { players: [] }, stats: { views: 1, playersVotes: { a: 1, b: 0 } } };

// [attendu, description, auth, méthode, chemin, resource existante, request.resource]
const cases = [
  ['ALLOW', 'anonyme lit un widget', anon, 'get', 'widgets/w1', widget],
  ['ALLOW', 'anonyme : vue +1', anon, 'update', 'widgets/w1', widget, { ...widget, stats: { views: 2 } }],
  ['DENY', 'anonyme modifie le contenu', anon, 'update', 'widgets/w1', widget, { ...widget, data: { question: 'X' } }],
  ['ALLOW', 'anonyme : vote POTM +1', anon, 'update', 'widgets/w1', potm, { ...potm, stats: { ...potm.stats, playersVotes: { a: 2, b: 0 } } }],
  ['ALLOW', 'anonyme : premier vote POTM d’un candidat sans compteur', anon, 'update', 'widgets/w1', potm, { ...potm, stats: { ...potm.stats, playersVotes: { a: 1, b: 0, c: 1 } } }],
  ['DENY', 'anonyme : vote POTM et autre compteur ensemble', anon, 'update', 'widgets/w1', potm, { ...potm, stats: { ...potm.stats, views: 9, playersVotes: { a: 2, b: 0 } } }],
  ['DENY', 'anonyme : vote POTM sur deux candidats', anon, 'update', 'widgets/w1', potm, { ...potm, stats: { ...potm.stats, playersVotes: { a: 2, b: 1 } } }],
  ['DENY', 'anonyme crée un widget', anon, 'create', 'widgets/w2', null, widget],
  ['DENY', 'anonyme lit un message (S1)', anon, 'get', 'widgets/w1/messages/m1', message],
  ['DENY', 'anonyme liste les messages (S1)', anon, 'list', 'widgets/w1/messages/m1', message],
  ['ALLOW', 'anonyme dépose un message', anon, 'create', 'widgets/w1/messages/m2', null, message],
  ['ALLOW', 'Google @ringier.ch lit les messages', googleRingier, 'list', 'widgets/w1/messages/m1', message],
  ['ALLOW', 'Google @ringier.ch crée un widget', googleRingier, 'create', 'widgets/w2', null, widget],
  ['ALLOW', 'Google @ringier.ch modifie un widget', googleRingier, 'update', 'widgets/w1', widget, { ...widget, data: { question: 'X' } }],
  ['ALLOW', 'Google @ringier.ch supprime un widget', googleRingier, 'delete', 'widgets/w1', widget],
  ['ALLOW', 'ancien compte de la liste crée un widget', legacy, 'create', 'widgets/w2', null, widget],
  ['DENY', 'mot de passe @ringier.ch non vérifié, hors liste', fakeRingier, 'create', 'widgets/w2', null, widget],
  ['DENY', 'Google gmail modifie un widget', googleGmail, 'update', 'widgets/w1', widget, { ...widget, data: { question: 'X' } }],
  ['DENY', 'Google gmail lit les messages', googleGmail, 'list', 'widgets/w1/messages/m1', message],
  ['DENY', 'anonyme lit teams', anon, 'get', 'teams/t1', { name: 'T' }],
  ['DENY', 'Google gmail lit teams', googleGmail, 'get', 'teams/t1', { name: 'T' }],
  ['ALLOW', 'Google @ringier.ch écrit teams', googleRingier, 'update', 'teams/t1', { name: 'T' }, { name: 'U' }],
  ['ALLOW', 'anonyme lit un embed', anon, 'get', 'embeds/e1', { title: 'T' }],
  ['DENY', 'Google gmail supprime un embed', googleGmail, 'delete', 'embeds/e1', { title: 'T' }],
  ['DENY', 'anonyme lit un message embed', anon, 'get', 'embeds/e1/messages/m1', message],
  ['DENY', 'membre écrit dans une collection inconnue', googleRingier, 'create', 'autre/x', null, { a: 1 }],
];

const testCases = cases.map(([expectation, , auth, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth,
    method,
    path: doc(path),
    time: NOW,
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
}));

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${env.project}:test`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': env.project, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: source }] }, testSuite: { testCases } }),
});
const out = await res.json();
if (out.error) {
  console.error(out.error.message);
  process.exit(1);
}
for (const issue of out.issues ?? []) console.error(`règles : ${issue.severity} ${issue.description} (l.${issue.sourcePosition?.line})`);
let failed = 0;
out.testResults.forEach((r, i) => {
  const ok = r.state === 'SUCCESS';
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${cases[i][0].padEnd(5)} ${cases[i][1]}${ok ? '' : `  ← ${r.debugMessages?.join(' ') || r.state}`}`);
});
console.log(`\n${envName} : ${cases.length - failed}/${cases.length} cas conformes`);
process.exit(failed ? 1 : 0);
