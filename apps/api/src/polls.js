import { createHash, randomUUID } from 'node:crypto';
import { validatePoll, validatePollEdits, buildPollSaveData, transformWidgetData, buildEmbedUrl } from '@rms/widget-model';
import { ApiError, AlreadyExistsError } from './errors.js';

export const DEFAULT_AUTHOR = 'Hub Rédaction';

const REQUEST_FIELDS = new Set(['question', 'answers', 'theme', 'brand', 'author']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;

const validationFailed = (errors) =>
  new ApiError(400, 'VALIDATION_FAILED', 'Requête invalide', {
    detail: `${errors.length} champ(s) invalide(s).`,
    errors,
  });

/**
 * Corps JSON → entrée partagée `PollInput`. Toutes les violations sont réunies en une erreur.
 * Les ids de réponses sont générés ici : le Hub n'envoie que des textes.
 *
 * @returns {{ input: object, author: string }}
 */
export function parseCreatePollRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed([{ field: 'body', code: 'invalid_type', message: 'Le corps doit être un objet JSON.' }]);
  }

  const errors = Object.keys(body)
    .filter((field) => !REQUEST_FIELDS.has(field))
    .map((field) => ({ field, code: 'unknown_field', message: `Champ inconnu : ${field}.` }));

  const { question, answers, theme, brand, author } = body;
  const input = {
    question,
    answers: Array.isArray(answers) ? answers.map((text) => ({ id: randomUUID(), text })) : answers,
    theme,
    brand,
  };
  errors.push(...validatePoll(input));

  if (author !== undefined && author !== null) {
    if (typeof author !== 'string') {
      errors.push({ field: 'author', code: 'invalid_type', message: 'L\'auteur doit être une adresse e-mail.' });
    } else if (author.length > 254 || !EMAIL.test(author)) {
      errors.push({ field: 'author', code: 'invalid_value', message: 'Adresse e-mail de l\'auteur invalide.' });
    }
  }

  if (errors.length > 0) throw validationFailed(errors);
  return { input, author: author ?? DEFAULT_AUTHOR };
}

/** @returns {string | undefined} */
export function parseIdempotencyKey(header) {
  if (header === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(header)) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key invalide', {
      detail: '1 à 255 caractères ASCII imprimables, sans espace.',
    });
  }
  return header;
}

// Id déterministe : au plus un sondage par couple (appelant, clé) — research.md R4.
const idempotentId = (callerEmail, key) =>
  createHash('sha256').update(`${callerEmail}\n${key}`).digest('hex').slice(0, 20);

const answerTexts = (doc) => (doc?.data?.answerTxts ?? []).map((answer) => answer?.text);

function sameContent(stored, requested) {
  return (
    stored?.type === requested.type &&
    stored.data?.question === requested.data.question &&
    JSON.stringify(answerTexts(stored)) === JSON.stringify(answerTexts(requested)) &&
    stored.meta?.brand === requested.meta.brand &&
    stored.meta?.theme === requested.meta.theme &&
    stored.meta?.author === requested.meta.author
  );
}

/**
 * Écrit le document en une opération (`create`, échoue si l'id existe).
 *
 * @param {{ input: object, author: string, caller: { email: string }, idempotencyKey?: string }} request
 * @param {{ store: { serverTimestamp: () => unknown, newId: () => string,
 *   create: (id: string, doc: object) => Promise<void>, get: (id: string) => Promise<object | null> },
 *   clientBaseUrl: string }} deps
 * @returns {Promise<{ status: 200 | 201, body: { id: string, embedUrl: string }, replayed: boolean }>}
 */
export async function createPoll({ input, author, caller, idempotencyKey }, { store, clientBaseUrl }) {
  const id = idempotencyKey ? idempotentId(caller.email, idempotencyKey) : store.newId();
  const doc = transformWidgetData(
    { ...buildPollSaveData(input), id, author, deleted: false },
    { serverTimestamp: store.serverTimestamp },
  );
  const body = { id, embedUrl: buildEmbedUrl({ type: 'poll', id, brand: doc.meta.brand }, clientBaseUrl) };

  try {
    await store.create(id, doc);
    return { status: 201, body, replayed: false };
  } catch (error) {
    if (!(error instanceof AlreadyExistsError) || !idempotencyKey) throw error;
  }

  const stored = await store.get(id);
  if (sameContent(stored, doc)) return { status: 200, body, replayed: true };
  throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key déjà utilisée', {
    detail: stored
      ? 'Cette clé a déjà créé un sondage au contenu différent (ou modifié depuis dans le dashboard).'
      : 'Cette clé a déjà servi pour un sondage supprimé depuis.',
  });
}

const PATCH_FIELDS = new Set(['question', 'answers', 'editor']);

/**
 * Corps d'un `PATCH /polls/{id}` → champs fournis, déjà typés et rognés. Toutes les violations
 * de forme sont réunies en une erreur ; la correspondance des ids avec le document existant est
 * vérifiée plus tard, au moment de la lecture (seul à connaître les ids stockés).
 */
export function parsePollPatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed([{ field: 'body', code: 'invalid_type', message: 'Le corps doit être un objet JSON.' }]);
  }

  const errors = Object.keys(body)
    .filter((field) => !PATCH_FIELDS.has(field))
    .map((field) => ({ field, code: 'unknown_field', message: `Champ inconnu : ${field}.` }));

  const { question, answers, editor } = body;
  errors.push(...validatePollEdits({ question, answers }));

  if (editor === undefined || editor === null) {
    errors.push({ field: 'editor', code: 'required', message: "L'éditeur est obligatoire." });
  } else if (typeof editor !== 'string') {
    errors.push({ field: 'editor', code: 'invalid_type', message: "L'éditeur doit être une chaîne de caractères." });
  } else if (editor.trim() === '') {
    errors.push({ field: 'editor', code: 'required', message: "L'éditeur est obligatoire." });
  }

  if (errors.length > 0) throw validationFailed(errors);
  return {
    question: typeof question === 'string' ? question.trim() : undefined,
    answers: Array.isArray(answers) ? answers.map((answer) => ({ id: answer.id, text: answer.text.trim() })) : undefined,
    editor: editor.trim(),
  };
}

function pollResponse(doc, clientBaseUrl) {
  const id = doc.meta?.id ?? '';
  const answers = (doc.data?.answerTxts ?? []).map((answer) => ({
    id: answer?.id ?? '',
    text: answer?.text ?? '',
    votes: Number(doc.stats?.answerCounters?.[answer?.id]) || 0,
  }));
  return {
    id,
    embedUrl: buildEmbedUrl({ type: 'poll', id, brand: doc.meta?.brand }, clientBaseUrl),
    question: doc.data?.question ?? '',
    answers,
    totalVotes: answers.reduce((sum, answer) => sum + answer.votes, 0),
    theme: doc.meta?.theme ?? '',
    brand: doc.meta?.brand ?? DEFAULT_POLL_BRAND,
  };
}

export async function getPoll({ id }, { store, clientBaseUrl }) {
  const doc = await store.get(id);
  if (!doc || doc.type !== 'poll') {
    throw new ApiError(404, 'NOT_FOUND', 'Sondage introuvable');
  }
  return pollResponse(doc, clientBaseUrl);
}

/**
 * Corrige la question et/ou les textes des réponses, sans jamais toucher aux votes. La
 * transaction relit le document au moment d'écrire : les ids de réponses sont comparés à ceux
 * stockés (même nombre, même ordre), et seuls `data.question`, `data.answerTxts`, `meta.updatedBy`
 * et `meta.updatedAt` sont écrits.
 */
export async function updatePoll({ id, body }, { store, clientBaseUrl }) {
  const { question, answers, editor } = parsePollPatch(body);

  const result = await store.update(id, (current) => {
    if (!current || current.type !== 'poll') throw new ApiError(404, 'NOT_FOUND', 'Sondage introuvable');

    const storedAnswers = current.data?.answerTxts ?? [];
    const errors = [];
    let nextAnswerTxts = storedAnswers;

    if (answers !== undefined) {
      if (answers.length !== storedAnswers.length) {
        errors.push({
          field: 'answers',
          code: 'invalid_value',
          message: `Le nombre de réponses (${answers.length}) ne correspond pas au sondage (${storedAnswers.length}).`,
        });
      } else {
        answers.forEach((answer, index) => {
          if (answer.id !== storedAnswers[index]?.id) {
            errors.push({
              field: `answers[${index}]`,
              code: 'invalid_value',
              message: `La réponse ${index + 1} ne correspond pas à la réponse du sondage (identifiant différent).`,
            });
          }
        });
        if (errors.length === 0) nextAnswerTxts = answers.map((answer) => ({ id: answer.id, text: answer.text }));
      }
    }
    if (errors.length > 0) throw validationFailed(errors);

    const patch = {
      'meta.updatedBy': editor,
      'meta.updatedAt': store.serverTimestamp(),
    };
    if (question !== undefined) patch['data.question'] = question;
    if (answers !== undefined) patch['data.answerTxts'] = nextAnswerTxts;

    const next = {
      ...current,
      data: { ...current.data, question: question ?? current.data?.question, answerTxts: nextAnswerTxts },
    };
    return { patch, next };
  });

  return pollResponse(result.next, clientBaseUrl);
}
