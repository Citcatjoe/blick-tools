// Importe les comptes Firebase Auth à mot de passe de la source vers la cible, avec leurs
// mots de passe (hachage SCRYPT Firebase + paramètres du projet source) et leurs uid,
// ce qui garde valable la liste de uids d'isMember() (firebase/test/firestore.rules).
// Écrase les comptes de la cible portant le même uid : uniquement avant la bascule.
// Prérequis : Authentication initialisée sur la cible (console > Authentication > Commencer).
// Usage : node import-users.mjs [--dry]
import { SRC, DST, DRY, token, requireOverwrite } from './config.mjs';

requireOverwrite();

const call = async ({ project, account }, url, body) => {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token(account)}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error(`${url}: ${j.error.message}`);
  return j;
};
const { users = [] } = await call(SRC, `https://identitytoolkit.googleapis.com/v1/projects/${SRC.project}/accounts:batchGet?maxResults=1000`);
const { signIn: { hashConfig: h } } = await call(SRC, `https://identitytoolkit.googleapis.com/admin/v2/projects/${SRC.project}/config`);
const payload = {
  hashAlgorithm: 'SCRYPT', signerKey: h.signerKey, saltSeparator: h.saltSeparator, rounds: h.rounds, memoryCost: h.memoryCost,
  users: users.filter((u) => u.passwordHash).map((u) => ({
    localId: u.localId, email: u.email, emailVerified: !!u.emailVerified, displayName: u.displayName,
    passwordHash: u.passwordHash, salt: u.salt, disabled: !!u.disabled,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  })),
};
console.log(`${payload.users.length}/${users.length} comptes avec mot de passe :`, payload.users.map((u) => u.email));
if (DRY) process.exit(0);
const res = await call(DST, `https://identitytoolkit.googleapis.com/v1/projects/${DST.project}/accounts:batchCreate`, payload);
console.log('erreurs :', res.error || 'aucune');
