// Images de quiz (specs/002-hub-widgets-api, clarification Q2) : téléchargées depuis une URL https
// fournie par le Hub, puis converties comme dans le dashboard (`ImageUploader.jsx` : WebP,
// ≤ 1928 px, ≈ 75 Ko). Le téléchargement part d'un service qui a accès au réseau interne de
// Google Cloud : chaque connexion est vérifiée contre les adresses privées (anti-SSRF), au moment
// même de la résolution DNS (pas de fenêtre entre vérification et connexion).

import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import sharp from 'sharp';

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TIMEOUT_MS = 10_000;
export const IMAGE_MAX_REDIRECTS = 3;
export const IMAGE_MAX_DIMENSION = 1928;
export const IMAGE_TARGET_BYTES = 75 * 1024;
export const IMAGE_MIN_DIMENSION = 480;
export const IMAGE_USER_AGENT = 'BlickToolsAPI/1.0 (+https://www.blick.ch; import d\'images de quiz)';

/**
 * Erreur d'image imputable à l'appelant (→ 400 sur le champ de l'image). `code` : `invalid_type`
 * (pas une image, ou format refusé), `too_large`, `invalid_value` (le reste, dont image illisible).
 */
export class ImageError extends Error {
  constructor(message, code = 'invalid_value') {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

const blocked = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

// `lookup` pour https.request : refuse la connexion si une adresse résolue n'est pas publique.
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
      return callback(new ImageError("L'hôte de l'image n'est pas une adresse publique."));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageError("L'URL de l'image est invalide.");
  }
  if (url.protocol !== 'https:') throw new ImageError("L'URL de l'image doit être en https.");
  if (url.username || url.password) throw new ImageError("L'URL de l'image ne doit pas contenir d'identifiants.");
  if (url.port && url.port !== '443') throw new ImageError("L'URL de l'image doit utiliser le port 443.");
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new ImageError("L'hôte de l'image doit être un nom de domaine public.");
  }
  return url;
}

function getOnce(url, { maxBytes, timeoutMs, request }) {
  return new Promise((resolve, reject) => {
    // User-Agent identifiable : plusieurs hébergeurs (Wikimedia…) refusent les requêtes anonymes.
    const headers = { Accept: 'image/*', 'User-Agent': IMAGE_USER_AGENT };
    const req = request(url, { lookup: guardedLookup, timeout: timeoutMs, headers }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        return resolve({ redirect: new URL(headers.location, url).toString() });
      }
      if (statusCode !== 200) {
        res.resume();
        return reject(new ImageError(`L'image n'a pas pu être téléchargée (HTTP ${statusCode}).`));
      }
      if (Number(headers['content-length']) > maxBytes) {
        res.destroy();
        return reject(new ImageError('L\'image dépasse 10 Mo.', 'too_large'));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new ImageError('L\'image dépasse 10 Mo.', 'too_large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new ImageError("Délai dépassé pour télécharger l'image.")));
    req.on('error', (error) => reject(error instanceof ImageError ? error : new ImageError("L'image n'a pas pu être téléchargée.")));
    req.end();
  });
}

/**
 * Télécharge une image depuis une URL https publique. Redirections suivies à la main, chaque
 * étape revalidée.
 * @returns {Promise<Buffer>}
 */
export async function fetchImageSafely(rawUrl, {
  maxBytes = IMAGE_MAX_BYTES, timeoutMs = IMAGE_TIMEOUT_MS, maxRedirects = IMAGE_MAX_REDIRECTS, request = https.request,
} = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = checkUrl(current);
    const result = await getOnce(url, { maxBytes, timeoutMs, request });
    if (result.body) return result.body;
    current = result.redirect;
  }
  throw new ImageError("Trop de redirections pour télécharger l'image.");
}

/**
 * Même traitement que le dashboard (`browser-image-compression` : 75 Ko, 1928 px) : rotation EXIF,
 * ≤ 1928 px sans agrandissement, WebP à qualité décroissante ; si la cible n'est toujours pas
 * atteinte, réduction des dimensions par paliers (comme la bibliothèque du dashboard), jusqu'à
 * 480 px au plus petit.
 * @param {Buffer} input
 * @param {{ formats?: string[] }} [options] formats `sharp` admis (tous si absent)
 * @returns {Promise<Buffer>}
 */
export async function toDashboardWebp(input, { formats } = {}) {
  let format;
  try {
    ({ format } = await sharp(input).metadata());
  } catch {
    throw new ImageError("Le fichier n'est pas une image.", 'invalid_type');
  }
  if (formats && !formats.includes(format)) {
    throw new ImageError(`Format d'image refusé (${format}) : JPEG, PNG, WebP ou GIF attendu.`, 'invalid_type');
  }

  let width;
  let height;
  try {
    const oriented = await sharp(input, { failOn: 'error' }).rotate().toBuffer({ resolveWithObject: true });
    input = oriented.data;
    ({ width, height } = oriented.info);
  } catch {
    throw new ImageError("L'image est illisible (fichier corrompu ou incomplet).");
  }

  let maxSide = Math.min(IMAGE_MAX_DIMENSION, Math.max(width, height));
  let output;
  for (;;) {
    const resized = sharp(input).resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    for (const quality of [92, 85, 78, 70, 62, 55, 48, 40]) {
      output = await resized.clone().webp({ quality }).toBuffer();
      if (output.length <= IMAGE_TARGET_BYTES) return output;
    }
    if (maxSide <= IMAGE_MIN_DIMENSION) return output;
    maxSide = Math.max(IMAGE_MIN_DIMENSION, Math.round(maxSide * 0.8));
  }
}
