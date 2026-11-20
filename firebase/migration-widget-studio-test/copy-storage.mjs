// Copie les images du Studio du bucket source vers celui de la cible (métadonnées
// conservées, dont le jeton firebaseStorageDownloadTokens : les URL restent valables
// une fois le bucket remplacé), puis réécrit dans le Firestore cible les URL qui
// pointent vers l'ancien bucket. Les dossiers perso (PERSONAL_PREFIXES) ne partent pas.
// Prérequis : bucket par défaut créé sur la cible, copy-firestore.mjs déjà passé.
// Usage : node copy-storage.mjs [--dry]
import { SRC, DST, COLLECTIONS, PERSONAL_PREFIXES, DRY, require, authClient, firestore, requireOverwrite } from './config.mjs';

requireOverwrite();

const { Storage } = require('@google-cloud/storage');
const OLD = [`/b/${SRC.bucket}/`, `/b/${SRC.project}.appspot.com/`], NEW = `/b/${DST.bucket}/`;
const src = new Storage({ projectId: SRC.project, authClient: authClient(SRC.account) }).bucket(SRC.bucket);
const dst = new Storage({ projectId: DST.project, authClient: authClient(DST.account) }).bucket(DST.bucket);
const db = firestore(DST);

const [all] = await src.getFiles();
const files = all.filter((f) => !PERSONAL_PREFIXES.some((p) => f.name.startsWith(p)));
console.log(`${files.length} objets à copier (${all.length - files.length} perso ignorés)`);
if (!DRY) {
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
for (const id of COLLECTIONS) await walk(db.collection(id));
console.log(`${DRY ? '[dry] ' : ''}${urls} URL dans ${docs} documents ${DRY ? 'à réécrire' : 'réécrites'}`);
