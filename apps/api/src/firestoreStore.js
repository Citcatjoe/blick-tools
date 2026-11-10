import { FieldValue } from 'firebase-admin/firestore';
import { AlreadyExistsError, unavailable } from './errors.js';

// Codes gRPC renvoyés par le SDK Admin Firestore.
const ALREADY_EXISTS = 6;
const RETRYABLE = new Set([
  4, // DEADLINE_EXCEEDED
  8, // RESOURCE_EXHAUSTED
  10, // ABORTED
  14, // UNAVAILABLE
]);

function translate(error) {
  if (error?.code === ALREADY_EXISTS) return new AlreadyExistsError();
  if (RETRYABLE.has(error?.code)) return unavailable('Firestore indisponible, réessayer avec la même Idempotency-Key.');
  return error;
}

/**
 * Accès à la collection `widgets` via le SDK Admin (compte de service du service Cloud Run).
 * @param {import('firebase-admin/firestore').Firestore} firestore
 */
export function createFirestoreStore(firestore) {
  const widgets = firestore.collection('widgets');
  return {
    serverTimestamp: () => FieldValue.serverTimestamp(),
    newId: () => widgets.doc().id,
    async create(id, doc) {
      try {
        await widgets.doc(id).create(doc);
      } catch (error) {
        throw translate(error);
      }
    },
    async get(id) {
      try {
        const snapshot = await widgets.doc(id).get();
        return snapshot.exists ? snapshot.data() : null;
      } catch (error) {
        throw translate(error);
      }
    },
    // Transaction lecture-écriture : `compute(currentDoc|null)` renvoie `{ patch, ... }` ou lève
    // une `ApiError` (404/400) qui remonte telle quelle. Firestore relance automatiquement la
    // fonction en cas de conflit d'écriture concurrente ; les votes en cours ne sont jamais lus
    // dans un état incohérent.
    async update(id, compute) {
      try {
        return await firestore.runTransaction(async (transaction) => {
          const ref = widgets.doc(id);
          const snapshot = await transaction.get(ref);
          const current = snapshot.exists ? snapshot.data() : null;
          const result = compute(current);
          if (result?.patch) transaction.update(ref, result.patch);
          return result;
        });
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
