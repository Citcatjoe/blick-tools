// ⚠️ Déjà exécuté le 2026-11-17. À ne relancer que pour resynchroniser la cible AVANT la bascule :
//    écrase les documents/comptes de sidekick-test-3ab83 portant le même identifiant.
// Copie récursive de toutes les collections (et sous-collections) source -> cible.
// Lecture seule sur la source. Types Firestore (Timestamp, GeoPoint, refs…) préservés par le SDK.
import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Firestore } = require('@google-cloud/firestore');
const { OAuth2Client } = require('google-auth-library');
const { execSync } = require('child_process');
const client = (acct, projectId) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: execSync(`gcloud auth print-access-token --account=${acct}`).toString().trim() });
  return new Firestore({ projectId, authClient: auth });
};
const src = client('cesargreppin@gmail.com', 'blick-tools-app');
const dst = client('cesar.greppin@ringier.ch', 'sidekick-test-3ab83');
const DRY = process.argv.includes('--dry');
let n = 0;
async function copyCol(srcCol, dstCol) {
  const snap = await srcCol.get();
  for (const d of snap.docs) {
    if (!DRY) await dstCol.doc(d.id).set(d.data());
    n++;
    for (const sub of await d.ref.listCollections()) await copyCol(sub, dstCol.doc(d.id).collection(sub.id));
  }
  console.log(`${srcCol.path}: ${snap.size}`);
}
for (const c of await src.listCollections()) await copyCol(c, dst.collection(c.id));
console.log(`${DRY ? '[dry] ' : ''}${n} documents copiés`);
