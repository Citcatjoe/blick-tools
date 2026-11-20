// Compare document par document (JSON canonique) source vs cible, collections du Studio.
// À lancer juste après copy-firestore.mjs : copy-storage.mjs réécrit ensuite les URL
// d'images dans la cible, qui diffère alors volontairement de la source.
import { SRC, DST, COLLECTIONS, firestore } from './config.mjs';

const src = firestore(SRC), dst = firestore(DST);
const canon = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k2) => [k2, x[k2]])) : x);
let ok = 0;
const bad = [];
async function walk(col) {
  for (const d of (await col.get()).docs) {
    const t = await dst.doc(d.ref.path).get();
    if (!t.exists || canon(t.data()) !== canon(d.data())) bad.push(d.ref.path); else ok++;
    for (const s of await d.ref.listCollections()) await walk(s);
  }
}
for (const id of COLLECTIONS) await walk(src.collection(id));
console.log(`identiques: ${ok}, différents/manquants: ${bad.length}`, bad);
