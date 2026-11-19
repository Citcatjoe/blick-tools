// Inventaire lecture seule du projet source (compte perso).
import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Firestore } = require('@google-cloud/firestore');
const { Storage } = require('@google-cloud/storage');
const { OAuth2Client } = require('google-auth-library');
const { execSync } = require('child_process');
const acct = process.argv[2], projectId = process.argv[3];
const tok = () => execSync(`gcloud auth print-access-token --account=${acct}`).toString().trim();
const auth = new OAuth2Client(); auth.setCredentials({ access_token: tok() });
const db = new Firestore({ projectId, authClient: auth });
const cols = await db.listCollections();
for (const c of cols) {
  const n = (await c.count().get()).data().count;
  let sub = {};
  if (n < 2000) { const docs = await c.listDocuments(); for (const d of docs) for (const s of await d.listCollections()) { sub[s.id] = (sub[s.id]||0) + (await s.count().get()).data().count; } }
  console.log(`firestore ${c.id}: ${n} docs`, JSON.stringify(sub));
}
const st = new Storage({ projectId, authClient: auth });
const [buckets] = await st.getBuckets();
for (const b of buckets) { const [files] = await b.getFiles(); const size = files.reduce((a,f)=>a+Number(f.metadata.size||0),0); console.log(`bucket ${b.name} (${b.metadata.location}): ${files.length} fichiers, ${(size/1e6).toFixed(1)} Mo`); }
