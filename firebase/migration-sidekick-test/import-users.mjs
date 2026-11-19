// ⚠️ Déjà exécuté le 2026-11-17. À ne relancer que pour resynchroniser la cible AVANT la bascule :
//    écrase les documents/comptes de sidekick-test-3ab83 portant le même identifiant.
// Importe les comptes Firebase Auth de blick-tools-app vers sidekick-test-3ab83
// avec leurs mots de passe (hachage SCRYPT Firebase + paramètres du projet source).
// Prérequis : Authentication initialisée sur la cible (console > Authentication > Commencer).
// Usage : node import-users.mjs [--dry]
import { execSync } from 'child_process';
const SRC = 'blick-tools-app', DST = 'sidekick-test-3ab83';
const tok = (a) => execSync(`gcloud auth print-access-token --account=${a}`).toString().trim();
const call = async (acct, project, url, body) => {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tok(acct)}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json(); if (j.error) throw new Error(`${url}: ${j.error.message}`); return j;
};
const srcA = 'cesargreppin@gmail.com', dstA = 'cesar.greppin@ringier.ch';
const { users = [] } = await call(srcA, SRC, `https://identitytoolkit.googleapis.com/v1/projects/${SRC}/accounts:batchGet?maxResults=1000`);
const { signIn: { hashConfig: h } } = await call(srcA, SRC, `https://identitytoolkit.googleapis.com/admin/v2/projects/${SRC}/config`);
const payload = {
  hashAlgorithm: 'SCRYPT', signerKey: h.signerKey, saltSeparator: h.saltSeparator, rounds: h.rounds, memoryCost: h.memoryCost,
  users: users.filter(u => u.passwordHash).map(u => ({
    localId: u.localId, email: u.email, emailVerified: !!u.emailVerified, displayName: u.displayName,
    passwordHash: u.passwordHash, salt: u.salt, disabled: !!u.disabled,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  })),
};
console.log(`${payload.users.length}/${users.length} comptes avec mot de passe :`, payload.users.map(u => u.email));
if (process.argv.includes('--dry')) process.exit(0);
const res = await call(dstA, DST, `https://identitytoolkit.googleapis.com/v1/projects/${DST}/accounts:batchCreate`, payload);
console.log('erreurs :', res.error || 'aucune');
