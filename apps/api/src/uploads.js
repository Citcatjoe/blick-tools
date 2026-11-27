// `POST /images` (specs/003-hub-parity-images) : le Hub envoie le fichier choisi par le journaliste
// (corps brut), l'API le traite comme une image importée par URL (WebP, ≤ 1928 px, ≈ 75 Ko) et le
// dépose sous le préfixe des envois, d'où un quiz le copiera.

import { validationFailed } from './errors.js';
import { IMAGE_MAX_BYTES, ImageError } from './images.js';
import { UPLOAD_PREFIX } from './imageStore.js';

// Content-Type admis → format détecté par `sharp` correspondant.
export const UPLOAD_CONTENT_TYPES = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
});
const UPLOAD_FORMATS = [...new Set(Object.values(UPLOAD_CONTENT_TYPES))];

// Un corps refusé est tout de même lu jusqu'au bout (`req.resume()`, sans le garder) : fermer la
// connexion pendant l'envoi priverait le client de la réponse `400`.
const imageFailure = (code, message) => validationFailed([{ field: 'image', code, message }]);

const TOO_LARGE = `L'image dépasse ${IMAGE_MAX_BYTES / 1024 / 1024} Mo.`;

function readImageBody(req) {
  if (Number(req.headers['content-length']) > IMAGE_MAX_BYTES) {
    req.resume();
    return Promise.reject(imageFailure('too_large', TOO_LARGE));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > IMAGE_MAX_BYTES) {
        req.off('data', onData);
        req.resume();
        reject(imageFailure('too_large', TOO_LARGE));
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * @param {import('node:http').IncomingMessage} req requête authentifiée, corps non lu
 * @param {{ images: { convert: (buffer: Buffer, options?: { formats?: string[] }) => Promise<Buffer> },
 *   imageStore: { put: (webp: Buffer, prefix: string) => Promise<{ url: string, path: string }> } }} deps
 * @returns {Promise<{ url: string, path: string, receivedBytes: number, storedBytes: number }>}
 */
export async function uploadImage(req, { images, imageStore }) {
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (!Object.hasOwn(UPLOAD_CONTENT_TYPES, contentType ?? '')) {
    req.resume();
    throw imageFailure('invalid_type', 'Format non accepté : envoyer une image JPEG, PNG, WebP ou GIF (en-tête Content-Type).');
  }
  const buffer = await readImageBody(req);
  if (buffer.length === 0) throw imageFailure('invalid_type', "Le corps de la requête ne contient pas d'image.");

  let webp;
  try {
    webp = await images.convert(buffer, { formats: UPLOAD_FORMATS });
  } catch (error) {
    if (error instanceof ImageError) throw imageFailure(error.code, error.message);
    throw error;
  }
  const { url, path } = await imageStore.put(webp, UPLOAD_PREFIX);
  return { url, path, receivedBytes: buffer.length, storedBytes: webp.length };
}
