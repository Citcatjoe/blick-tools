import { ApiError, sendJson, sendProblem } from './errors.js';
import { parseCreatePollRequest, parseIdempotencyKey, createPoll, getPoll, updatePoll } from './polls.js';

export const MAX_BODY_BYTES = 64 * 1024;

// Journal structuré lu par Cloud Logging (`severity`). Jamais de jeton ni de corps de requête.
export const logToStdout = (severity, message, fields) =>
  console.log(JSON.stringify({ severity, message, ...fields }));

const isJson = (contentType) => contentType?.split(';')[0].trim().toLowerCase() === 'application/json';

const decodeSegment = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'Ressource inconnue');
  }
};

const payloadTooLarge = () =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Corps trop volumineux', {
    detail: `Maximum ${MAX_BODY_BYTES} octets.`,
    headers: { Connection: 'close' },
  });

function readJsonBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    req.resume();
    return Promise.reject(payloadTooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.off('data', onData);
        req.resume(); // vide le reste sans le garder en mémoire
        reject(payloadTooLarge());
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', 'JSON illisible', { detail: 'Le corps doit être un document JSON valide.' }));
      }
    });
  });
}

/**
 * Handler `node:http` de l'API. Ordre des contrôles : route → méthode → identité → type de
 * contenu → Idempotency-Key → corps → validation → écriture. Aucun corps n'est lu avant
 * l'authentification.
 *
 * @param {{ verifyCaller: (authorization?: string) => Promise<{ email: string }>,
 *   store: object, clientBaseUrl: string, log?: typeof logToStdout }} deps
 */
export function createApp({ verifyCaller, store, clientBaseUrl, log = logToStdout }) {
  return async function handleRequest(req, res) {
    const startedAt = Date.now();
    let caller;
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      const byId = pathname.match(/^\/polls\/([^/]+)$/);

      if (pathname === '/polls') {
        if (req.method !== 'POST') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'POST' } });
        }

        caller = await verifyCaller(req.headers.authorization);
        if (!isJson(req.headers['content-type'])) {
          throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Type de contenu non pris en charge', {
            detail: 'Content-Type: application/json attendu.',
          });
        }
        const idempotencyKey = parseIdempotencyKey(req.headers['idempotency-key']);
        const { input, author } = parseCreatePollRequest(await readJsonBody(req));
        const result = await createPoll({ input, author, caller, idempotencyKey }, { store, clientBaseUrl });

        sendJson(res, result.status, result.body, result.replayed ? { 'Idempotent-Replayed': 'true' } : {});
        log('INFO', result.replayed ? 'poll replayed' : 'poll created', {
          caller: caller.email,
          widgetId: result.body.id,
          status: result.status,
          idempotent: Boolean(idempotencyKey),
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      if (byId) {
        const id = decodeSegment(byId[1]);
        caller = await verifyCaller(req.headers.authorization);

        if (req.method === 'GET') {
          const result = await getPoll({ id }, { store, clientBaseUrl });
          sendJson(res, 200, result);
          log('INFO', 'poll read', { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }
        if (req.method === 'PATCH') {
          if (!isJson(req.headers['content-type'])) {
            throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Type de contenu non pris en charge', {
              detail: 'Content-Type: application/json attendu.',
            });
          }
          const result = await updatePoll({ id, body: await readJsonBody(req) }, { store, clientBaseUrl });
          sendJson(res, 200, result);
          log('INFO', 'poll updated', { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'GET, PATCH' } });
      }

      throw new ApiError(404, 'NOT_FOUND', 'Ressource inconnue');
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL', 'Erreur interne');
      sendProblem(res, apiError);
      log(apiError.status >= 500 ? 'ERROR' : 'WARNING', 'request rejected', {
        caller: caller?.email,
        method: req.method,
        path: req.url,
        status: apiError.status,
        code: apiError.code,
        fields: apiError.errors?.map((fieldError) => fieldError.field),
        error: apiError === error ? undefined : String(error?.stack ?? error),
        durationMs: Date.now() - startedAt,
      });
    }
  };
}
