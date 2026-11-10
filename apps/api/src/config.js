// Configuration exclusivement par variables d'environnement, validée au démarrage :
// aucune valeur par défaut ne pointe vers la production (constitution, principe IV).

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ audience: string, allowedCallers: Set<string>, clientBaseUrl: string, port: number }}
 */
export function loadConfig(env) {
  const problems = [];

  const audience = env.API_AUDIENCE?.trim();
  if (!audience) problems.push('API_AUDIENCE manquante (URL du service Cloud Run)');

  const allowedCallers = (env.ALLOWED_CALLERS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (allowedCallers.length === 0) {
    problems.push('ALLOWED_CALLERS vide (e-mails de comptes de service, séparés par des virgules)');
  }

  const clientBaseUrl = env.CLIENT_BASE_URL?.trim();
  if (!clientBaseUrl) {
    problems.push('CLIENT_BASE_URL manquante');
  } else if (!/^https:\/\/\S+\/bl-tools-client-$/.test(clientBaseUrl)) {
    problems.push('CLIENT_BASE_URL doit être une URL https se terminant par "/bl-tools-client-"');
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`PORT invalide : ${env.PORT}`);

  if (problems.length > 0) {
    throw new Error(`Configuration invalide : ${problems.join(' ; ')}`);
  }
  return Object.freeze({ audience, allowedCallers: new Set(allowedCallers), clientBaseUrl, port });
}
