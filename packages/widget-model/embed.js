import { DEFAULT_POLL_BRAND } from './poll.js';

// Racine des dossiers FTP `bl-tools-client-<type>` en production.
export const DEFAULT_CLIENT_BASE_URL = 'https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-client-';

/**
 * URL d'iframe d'un widget : `<base><type>/?<type>Doc=<id>`. Pour `poll`, `&brand=` active, dans
 * `apps/poll/index.html`, l'intégration de la page hôte PME (hauteur via postMessage, darkmode).
 *
 * @param {{ type: string, id: string, brand?: string }} widget
 * @param {string} [clientBaseUrl] base de l'environnement (test : `_sandbox/…`)
 */
export function buildEmbedUrl({ type, id, brand }, clientBaseUrl = DEFAULT_CLIENT_BASE_URL) {
  const url = `${clientBaseUrl}${type}/?${type}Doc=${id}`;
  return type === 'poll' ? `${url}&brand=${brand || DEFAULT_POLL_BRAND}` : url;
}
