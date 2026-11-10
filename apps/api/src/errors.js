// Erreurs HTTP au format RFC 9457 (application/problem+json).
// Contrat : specs/001-poll-create-api/contracts/openapi.yaml (schéma `Problem`).

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code code stable, en MAJUSCULES
   * @param {string} title
   * @param {{ detail?: string, errors?: object[], headers?: Record<string, string> }} [options]
   */
  constructor(status, code, title, { detail, errors, headers } = {}) {
    super(`${code}: ${title}`);
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.headers = headers ?? {};
  }
}

// Levée par un store quand l'id de document existe déjà (rejeu idempotent).
export class AlreadyExistsError extends Error {}

export const unavailable = (detail) =>
  new ApiError(503, 'UNAVAILABLE', 'Service temporairement indisponible', { detail, headers: { 'Retry-After': '5' } });

function send(res, status, contentType, body, headers) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': `${contentType}; charset=utf-8`,
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export function sendJson(res, status, body, headers = {}) {
  send(res, status, 'application/json', body, headers);
}

/** @param {ApiError} error */
export function sendProblem(res, error) {
  const body = { status: error.status, code: error.code, title: error.title };
  if (error.detail) body.detail = error.detail;
  if (error.errors) body.errors = error.errors;
  send(res, error.status, 'application/problem+json', body, error.headers);
}
