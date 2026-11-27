import { ApiError, sendJson, sendProblem } from './errors.js';
import { parseCreatePollRequest, parseIdempotencyKey, createPoll, getPoll, updatePoll } from './polls.js';
import { RESOURCE_TYPES, parseCreateRequest, createWidget, getWidget, updateWidget } from './widgets.js';
import { uploadImage } from './uploads.js';
import { WIDGET_FORMS, listTeamsForPicker } from '@rms/widget-model';

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

const requireJson = (req) => {
  if (!isJson(req.headers['content-type'])) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Type de contenu non pris en charge', {
      detail: 'Content-Type: application/json attendu.',
    });
  }
};

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
 *   store: object, clientBaseUrl: string, log?: typeof logToStdout,
 *   images?: { fetch: (url: string) => Promise<Buffer>, convert: (buffer: Buffer, options?: { formats?: string[] }) => Promise<Buffer> },
 *   imageStore?: { put: (webp: Buffer, prefix: string) => Promise<{ url: string, path: string }>,
 *     adopt: (url: string, prefix: string) => Promise<{ url: string, path?: string } | null>,
 *     remove: (path: string) => Promise<void> } }} deps
 */
export function createApp({ verifyCaller, store, clientBaseUrl, images, imageStore, log = logToStdout }) {
  return async function handleRequest(req, res) {
    const startedAt = Date.now();
    let caller;
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      // Description des formulaires de création (spec 004) : le Hub construit ses formulaires à partir d'elle.
      if (pathname === '/widget-types') {
        if (req.method !== 'GET') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'GET' } });
        }
        caller = await verifyCaller(req.headers.authorization);
        sendJson(res, 200, { formats: WIDGET_FORMS });
        log('INFO', 'widget types read', { caller: caller.email, status: 200, durationMs: Date.now() - startedAt });
        return;
      }

      // Effectifs des notes des joueurs (specs/005) : le Hub propose les joueurs de `natinotes`.
      if (pathname === '/teams') {
        if (req.method !== 'GET') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'GET' } });
        }
        caller = await verifyCaller(req.headers.authorization);
        sendJson(res, 200, { teams: listTeamsForPicker(await store.listTeams()) });
        log('INFO', 'teams read', { caller: caller.email, status: 200, durationMs: Date.now() - startedAt });
        return;
      }

      const byId = pathname.match(/^\/polls\/([^/]+)$/);
      // `/<ressource>` et `/<ressource>/<id>` de chaque format de `widgets.js` (`RESOURCE_TYPES`).
      const resourceRoute = pathname.match(/^\/([^/]+)(?:\/([^/]+))?$/);
      const widgetRoute = resourceRoute && Object.hasOwn(RESOURCE_TYPES, resourceRoute[1]) ? resourceRoute : null;

      if (widgetRoute) {
        const type = RESOURCE_TYPES[widgetRoute[1]];
        const id = widgetRoute[2] === undefined ? undefined : decodeSegment(widgetRoute[2]);
        const allowed = id === undefined ? ['POST'] : ['GET', 'PUT'];
        if (!allowed.includes(req.method)) {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: allowed.join(', ') } });
        }
        caller = await verifyCaller(req.headers.authorization);

        if (id !== undefined && req.method === 'GET') {
          const result = await getWidget(type, { id }, { store, clientBaseUrl });
          sendJson(res, 200, result);
          log('INFO', `${type} read`, { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }
        if (id !== undefined) {
          requireJson(req);
          const result = await updateWidget(type, { id, body: await readJsonBody(req) }, { store, clientBaseUrl, images, imageStore });
          sendJson(res, 200, result);
          log('INFO', `${type} edited`, { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }

        requireJson(req);
        const idempotencyKey = parseIdempotencyKey(req.headers['idempotency-key']);
        const { input, author, context } = await parseCreateRequest(type, await readJsonBody(req), { store });
        const result = await createWidget(type, { input, author, context, caller, idempotencyKey }, { store, clientBaseUrl, images, imageStore });
        sendJson(res, result.status, result.body, result.replayed ? { 'Idempotent-Replayed': 'true' } : {});
        log('INFO', result.replayed ? `${type} replayed` : `${type} created`, {
          caller: caller.email,
          widgetId: result.body.id,
          status: result.status,
          idempotent: Boolean(idempotencyKey),
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      if (pathname === '/images') {
        if (req.method !== 'POST') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'POST' } });
        }
        caller = await verifyCaller(req.headers.authorization);
        const upload = await uploadImage(req, { images, imageStore });
        sendJson(res, 201, { url: upload.url });
        log('INFO', 'image uploaded', {
          caller: caller.email,
          path: upload.path,
          receivedBytes: upload.receivedBytes,
          storedBytes: upload.storedBytes,
          status: 201,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      if (pathname === '/polls') {
        if (req.method !== 'POST') {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'POST' } });
        }

        caller = await verifyCaller(req.headers.authorization);
        requireJson(req);
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
        if (req.method === 'PUT') {
          requireJson(req);
          const result = await updateWidget('poll', { id, body: await readJsonBody(req) }, { store, clientBaseUrl, images, imageStore });
          sendJson(res, 200, result);
          log('INFO', 'poll edited', { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }
        if (req.method === 'PATCH') {
          requireJson(req);
          const result = await updatePoll({ id, body: await readJsonBody(req) }, { store, clientBaseUrl });
          sendJson(res, 200, result);
          log('INFO', 'poll updated', { caller: caller.email, widgetId: id, status: 200, durationMs: Date.now() - startedAt });
          return;
        }
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée', { headers: { Allow: 'GET, PATCH, PUT' } });
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
