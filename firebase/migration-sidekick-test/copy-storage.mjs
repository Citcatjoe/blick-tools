// Copie les objets du bucket Firebase de blick-tools-app vers celui de sidekick-test
// (métadonnées conservées, dont le jeton firebaseStorageDownloadTokens), puis réécrit
// dans Firestore cible les URL firebasestorage qui pointent vers l'ancien bucket.
// Prérequis : facturation liée + bucket par défaut créé sur la cible.
// Usage : node copy-storage.mjs [--dry]
import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { Storage } = require('@google-cloud/storage');
const { Firestore } = require('@google-cloud/firestore');
const { OAuth2Client } = require('google-auth-library');
const { execSync } = require('child_process');
const auth = (a) => { const c = new OAuth2Client(); c.setCredentials({ access_token: execSync(`gcloud auth print-access-token --account=${a}`).toString().trim() }); return c; };
const SRC_B = 'blick-tools-app.firebasestorage.app', DST_B = 'sidekick-test-3ab83.firebasestorage.app';
const OLD = [`/b/${SRC_B}/`, '/b/blick-tools-app.appspot.com/'], NEW = `/b/${DST_B}/`;
const DRY = process.argv.includes('--dry');
const src = new Storage({ projectId: 'blick-tools-app', authClient: auth('cesargreppin@gmail.com') }).bucket(SRC_B);
const dstStorage = new Storage({ projectId: 'sidekick-test-3ab83', authClient: auth('cesar.greppin@ringier.ch') });
const db = new Firestore({ projectId: 'sidekick-test-3ab83', authClient: auth('cesar.greppin@ringier.ch') });

const [files] = await src.getFiles();
console.log(`${files.length} objets à copier`);
if (!DRY) {
  const dst = dstStorage.bucket(DST_B);
  for (const f of files) {
    const [buf] = await f.download();
    const m = f.metadata;
    await dst.file(f.name).save(buf, { resumable: false, metadata: { contentType: m.contentType, cacheControl: m.cacheControl, contentDisposition: m.contentDisposition, metadata: m.metadata } });
  }
  console.log('objets copiés');
}
// Réécriture des URL (récursive dans tout le document).
const rewrite = (v) => typeof v === 'string' ? OLD.reduce((s, o) => s.split(o).join(NEW), v)
  : Array.isArray(v) ? v.map(rewrite)
  : v && typeof v === 'object' && v.constructor === Object ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)])) : v;
let docs = 0, urls = 0;
async function walk(col) {
  for (const d of (await col.get()).docs) {
    const before = JSON.stringify(d.data());
    const n = OLD.reduce((a, o) => a + before.split(o).length - 1, 0);
    if (n) { docs++; urls += n; if (!DRY) await d.ref.set(rewrite(d.data())); }
    for (const s of await d.ref.listCollections()) await walk(s);
  }
}
for (const c of await db.listCollections()) await walk(c);
console.log(`${DRY ? '[dry] ' : ''}${urls} URL dans ${docs} documents ${DRY ? 'à réécrire' : 'réécrites'}`);
