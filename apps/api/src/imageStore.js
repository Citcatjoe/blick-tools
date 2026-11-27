// Images des widgets dans le Firebase Storage de l'environnement, sous le préfixe du format
// (`images.prefix` de la description : `quizs`, `teasers`, `folders`, `factss`) et avec la même
// forme d'URL que le dashboard (`ImageUploader.jsx` : `<type>s/<horodatage>_<nom>`, URL de
// téléchargement à jeton). Les règles Storage ne s'appliquent pas au SDK Admin : le droit
// d'écriture vient du rôle du compte de service sur ce seul bucket.
//
// Envois du Hub (`POST /images`, specs/003-hub-parity-images) : déposés sous `UPLOAD_PREFIX`, que
// la règle de cycle de vie du bucket supprime après `UPLOAD_RETENTION_DAYS` jours. Un widget qui
// les utilise en reçoit une copie sous son préfixe : une image envoyée puis abandonnée disparaît
// seule.

import { randomUUID } from 'node:crypto';
import { unavailable } from './errors.js';
import { ImageError } from './images.js';

export const UPLOAD_PREFIX = 'hub-uploads';
export const UPLOAD_RETENTION_DAYS = 7;

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

const translate = (error) =>
  RETRYABLE_HTTP.has(Number(error?.code)) ? unavailable('Stockage des images indisponible, réessayer.') : error;

const downloadUrl = (bucketName, path, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

/**
 * URL de téléchargement Firebase d'un objet de `bucketName` → `{ path, token }` ; `null` pour
 * toute autre URL.
 */
export function parseStorageUrl(raw, bucketName) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'firebasestorage.googleapis.com' || url.port) return null;
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
  if (!match || match[1] !== bucketName) return null;
  try {
    return { path: decodeURIComponent(match[2]), token: url.searchParams.get('token') ?? '' };
  } catch {
    return null;
  }
}

/** @param {import('@google-cloud/storage').Bucket} bucket */
export function createImageStore(bucket) {
  const save = async (webp, prefix) => {
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
    return { url: downloadUrl(bucket.name, path, token), path };
  };

  return {
    /** @returns {Promise<{ url: string, path: string }>} */
    put: save,

    /**
     * Image déjà dans ce bucket : `null` si l'URL est d'ailleurs (à télécharger). Sinon l'objet
     * doit exister, porter le jeton de l'URL et être une image (`ImageError` sinon). Un envoi du
     * Hub est copié sous `prefix` (`path` = la copie, à nettoyer en cas d'échec) ; toute autre
     * image du bucket est gardée telle quelle.
     * @returns {Promise<{ url: string, path?: string } | null>}
     */
    async adopt(url, prefix) {
      const location = parseStorageUrl(url, bucket.name);
      if (!location) return null;
      let metadata;
      try {
        [metadata] = await bucket.file(location.path).getMetadata();
      } catch (error) {
        if (Number(error?.code) !== 404) throw translate(error);
      }
      const tokens = String(metadata?.metadata?.firebaseStorageDownloadTokens ?? '').split(',');
      if (!metadata || !location.token || !tokens.includes(location.token) || !String(metadata.contentType).startsWith('image/')) {
        throw new ImageError(`Image introuvable dans le stockage Blick Tools (un envoi expire après ${UPLOAD_RETENTION_DAYS} jours) : la renvoyer.`);
      }
      if (!location.path.startsWith(`${UPLOAD_PREFIX}/`)) return { url };

      const token = randomUUID();
      const path = `${prefix}/${Date.now()}_${randomUUID()}.webp`;
      try {
        // Les métadonnées fournies remplacent celles de la source : type et nouveau jeton.
        await bucket.file(location.path).copy(bucket.file(path), {
          contentType: 'image/webp',
          metadata: { firebaseStorageDownloadTokens: token },
        });
      } catch (error) {
        if (Number(error?.code) === 404) throw new ImageError(`Image introuvable dans le stockage Blick Tools (un envoi expire après ${UPLOAD_RETENTION_DAYS} jours) : la renvoyer.`);
        throw translate(error);
      }
      return { url: downloadUrl(bucket.name, path, token), path };
    },

    async remove(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
