import { ApiError, unavailable } from './errors.js';

// Authentification serveur à serveur : ID token OIDC signé par Google + liste blanche d'e-mails
// de comptes de service (specs/001-poll-create-api/research.md R5).

const unauthenticated = (detail) =>
  new ApiError(401, 'UNAUTHENTICATED', 'Authentification requise', {
    detail,
    headers: { 'WWW-Authenticate': 'Bearer' },
  });

/**
 * @param {{ audience: string, allowedCallers: Set<string>,
 *   client: Pick<import('google-auth-library').OAuth2Client, 'getFederatedSignonCertsAsync' | 'verifyIdToken'> }} deps
 * @returns {(authorization: string | undefined) => Promise<{ email: string }>}
 */
export function createCallerVerifier({ audience, allowedCallers, client }) {
  return async function verifyCaller(authorization) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
    if (!match) {
      throw unauthenticated('En-tête « Authorization: Bearer <ID token Google> » attendu.');
    }

    // Certificats Google (mis en cache par le client). Un échec ici est réseau, pas un mauvais
    // jeton : le signaler comme temporaire plutôt que de refuser l'appelant.
    try {
      await client.getFederatedSignonCertsAsync();
    } catch {
      throw unavailable('Certificats Google injoignables, réessayer.');
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: match[1], audience });
      payload = ticket.getPayload();
    } catch {
      // Le message d'erreur de la bibliothèque contient le jeton : ne jamais le propager.
      throw unauthenticated('Jeton invalide, expiré ou émis pour une autre audience.');
    }

    if (!payload?.email || payload.email_verified !== true) {
      throw unauthenticated('Le jeton doit porter l\'e-mail vérifié du compte de service (format « full »).');
    }
    if (!allowedCallers.has(payload.email)) {
      throw new ApiError(403, 'FORBIDDEN', 'Appelant non autorisé', {
        detail: `${payload.email} ne figure pas dans la liste blanche de ce service.`,
      });
    }
    return { email: payload.email };
  };
}
