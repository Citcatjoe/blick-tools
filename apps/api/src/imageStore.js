// Copie des images de quiz dans le Firebase Storage de l'environnement, sous le même préfixe et
// avec la même forme d'URL que le dashboard (`ImageUploader.jsx` : `quizs/<horodatage>_<nom>`,
// URL de téléchargement à jeton). Les règles Storage ne s'appliquent pas au SDK Admin : le droit
// d'écriture vient du rôle du compte de service sur ce seul bucket.

import { randomUUID } from 'node:crypto';
import { unavailable } from './errors.js';

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

const translate = (error) =>
  RETRYABLE_HTTP.has(Number(error?.code)) ? unavailable('Stockage des images indisponible, réessayer.') : error;

/** @param {import('@google-cloud/storage').Bucket} bucket */
export function createImageStore(bucket) {
  return {
    /** @returns {Promise<{ url: string, path: string }>} */
    async put(webp, prefix = 'quizs') {
      const token = randomUUID();
      const path = `${prefix}/${Date.now()}_${randomUUID()}.webp`;
      try {
        await bucket.file(path).save(webp, {
          resumable: false,
          contentType: 'image/webp',
          metadata: { metadata: { firebaseStorageDownloadTokens: token } },
        });
      } catch (error) {
        throw translate(error);
      }
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
      return { url, path };
    },
    async remove(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
