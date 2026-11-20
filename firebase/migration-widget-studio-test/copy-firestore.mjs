// Copie récursive des collections du Studio (et de leurs sous-collections) source → cible.
// Écrase les documents de la cible portant le même identifiant : à relancer uniquement
// AVANT la bascule, pour resynchroniser (depuis : --ecraser obligatoire). Types Firestore (Timestamp, refs…) préservés.
// Usage : node copy-firestore.mjs [--dry]
import { SRC, DST, COLLECTIONS, DRY, firestore, requireOverwrite } from './config.mjs';

requireOverwrite();

const src = firestore(SRC);
const dst = firestore(DST);
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
for (const id of COLLECTIONS) await copyCol(src.collection(id), dst.collection(id));
console.log(`${DRY ? '[dry] ' : ''}${n} documents copiés vers ${DST.project}`);
