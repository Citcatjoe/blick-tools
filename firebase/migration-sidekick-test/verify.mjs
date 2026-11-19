// Compare document par document (JSON canonique) source vs cible.
import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Firestore } = require('@google-cloud/firestore');
const { OAuth2Client } = require('google-auth-library');
const { execSync } = require('child_process');
const client = (acct, projectId) => { const a = new OAuth2Client(); a.setCredentials({ access_token: execSync(`gcloud auth print-access-token --account=${acct}`).toString().trim() }); return new Firestore({ projectId, authClient: a }); };
const src = client('cesargreppin@gmail.com', 'blick-tools-app'), dst = client('cesar.greppin@ringier.ch', 'sidekick-test-3ab83');
const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k2 => [k2, x[k2]])) : x);
let ok = 0, bad = [];
async function walk(col) {
  for (const d of (await col.get()).docs) {
    const t = await dst.doc(d.ref.path).get();
    if (!t.exists || canon(t.data()) !== canon(d.data())) bad.push(d.ref.path); else ok++;
    for (const s of await d.ref.listCollections()) await walk(s);
  }
}
for (const c of await src.listCollections()) await walk(c);
console.log(`identiques: ${ok}, différents/manquants: ${bad.length}`, bad);
