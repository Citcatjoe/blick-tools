// Calendriers, tinders et quiz (specs/002-hub-widgets-api) : création et lecture, sur le modèle
// de `POST/GET /polls`. Validation et construction viennent de `@rms/widget-model` (mêmes
// documents que le dashboard) ; ce module ne fait que traduire la requête, gérer l'idempotence,
// les images de quiz et la projection de lecture.

import { createHash } from 'node:crypto';
import {
  validateCalendar, buildCalendarSaveData,
  validateTinder, buildTinderSaveData,
  validateQuiz, buildQuizSaveData,
  transformWidgetData, buildEmbedUrl, DEFAULT_BRAND,
} from '@rms/widget-model';
import { ApiError, AlreadyExistsError, validationFailed } from './errors.js';
import { DEFAULT_AUTHOR, authorErrors } from './polls.js';
import { parseDateTime } from './dates.js';
import { ImageError } from './images.js';

const COMMON_FIELDS = ['theme', 'brand', 'author'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Champs inconnus d'un objet (corps ou élément imbriqué) → erreurs `unknown_field`. */
function unknownFields(object, allowed, prefix = '') {
  if (!isObject(object)) return [];
  return Object.keys(object)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ field: `${prefix}${key}`, code: 'unknown_field', message: `Champ inconnu : ${prefix}${key}.` }));
}

function eachItem(list, prefix, allowed, errors) {
  if (Array.isArray(list)) list.forEach((item, index) => errors.push(...unknownFields(item, allowed, `${prefix}[${index}].`)));
}

const toIso = (timestamp) => {
  if (!timestamp) return null;
  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : timestamp;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);

// ---------------------------------------------------------------------------------------------
// Un format = sa traduction de requête, sa validation/construction partagées, sa projection.
// ---------------------------------------------------------------------------------------------

const FORMATS = {
  calendar: {
    resource: 'calendars',
    noun: 'calendrier',
    fields: [...COMMON_FIELDS, 'title', 'dates', 'nbElemsToShow', 'linkGlobal'],
    parse(body, errors) {
      eachItem(body.dates, 'dates', ['text', 'complement', 'start'], errors);
      errors.push(...unknownFields(body.linkGlobal, ['text', 'href', 'newTab'], 'linkGlobal.'));
      const dates = Array.isArray(body.dates)
        ? body.dates.map((date) => (isObject(date)
          ? {
            text: date.text,
            complement: date.complement,
            // Date illisible → `Invalid Date`, refusée par la validation partagée (`invalid_value`).
            start: date.start === undefined || date.start === null ? date.start : (parseDateTime(date.start) ?? new Date(NaN)),
          }
          : date))
        : body.dates;
      return { theme: body.theme, brand: body.brand, title: body.title, dates, nbElemsToShow: body.nbElemsToShow, linkGlobal: body.linkGlobal };
    },
    validate: validateCalendar,
    build: (input, store) => buildCalendarSaveData(input, { toTimestamp: store.toTimestamp }),
    fingerprint: (doc) => ({
      title: doc.data?.title,
      dates: (doc.data?.dates ?? []).map((date) => [date.text, date.complement, toIso(date.scheduleStart)]),
      nbElemsToShow: doc.data?.nbElemsToShow,
      link: [doc.data?.linkGlobalTxt ?? '', doc.data?.linkGlobalHref ?? '', doc.data?.linkGlobalNewTab === true],
    }),
    project: (doc) => ({
      title: doc.data?.title ?? '',
      dates: (doc.data?.dates ?? []).map((date) => ({ text: date.text ?? '', complement: date.complement ?? '', start: toIso(date.scheduleStart) })),
      nbElemsToShow: doc.data?.nbElemsToShow ?? null,
      linkGlobal: doc.data?.linkGlobalHref
        ? { text: doc.data.linkGlobalTxt ?? '', href: doc.data.linkGlobalHref, newTab: doc.data.linkGlobalNewTab === true }
        : null,
      views: Number(doc.stats?.views) || 0,
      seeAllClicks: Number(doc.stats?.seeAllClicks) || 0,
    }),
  },

  tinder: {
    resource: 'tinders',
    noun: 'tinder',
    fields: [...COMMON_FIELDS, 'label', 'title', 'cards'],
    parse(body, errors) {
      eachItem(body.cards, 'cards', ['label', 'title'], errors);
      return { theme: body.theme, brand: body.brand, label: body.label, title: body.title, cards: body.cards };
    },
    validate: validateTinder,
    build: (input) => buildTinderSaveData(input),
    fingerprint: (doc) => ({
      label: doc.data?.tinderLabel,
      title: doc.data?.tinderTitle,
      cards: (doc.data?.tinderCards ?? []).map((card) => [card.tinderCardLabel, card.tinderCardTitle]),
    }),
    project: (doc) => {
      const votes = doc.stats?.tinderVotes ?? doc.data?.tinderVotes ?? {};
      return {
        label: doc.data?.tinderLabel ?? '',
        title: doc.data?.tinderTitle ?? '',
        cards: (doc.data?.tinderCards ?? []).map((card) => ({
          id: card.id ?? null,
          label: card.tinderCardLabel ?? '',
          title: card.tinderCardTitle ?? '',
          yes: Number(votes[card.id]?.yes) || 0,
          no: Number(votes[card.id]?.no) || 0,
        })),
        views: Number(doc.stats?.views) || 0,
      };
    },
  },

  quiz: {
    resource: 'quizzes',
    noun: 'quiz',
    fields: [...COMMON_FIELDS, 'title', 'questions', 'conclusion'],
    parse(body, errors) {
      eachItem(body.questions, 'questions', ['text', 'answers', 'hint', 'img', 'hidePercent'], errors);
      if (Array.isArray(body.questions)) {
        body.questions.forEach((question, index) => {
          if (isObject(question)) eachItem(question.answers, `questions[${index}].answers`, ['text', 'isCorrect'], errors);
        });
      }
      errors.push(...unknownFields(body.conclusion, ['text1', 'text2', 'text3'], 'conclusion.'));
      return { theme: body.theme, brand: body.brand, title: body.title, questions: body.questions, conclusion: body.conclusion };
    },
    validate: validateQuiz,
    build: (input) => buildQuizSaveData(input),
    fingerprint: (doc) => ({
      title: doc.data?.title,
      questions: (doc.data?.questions ?? []).map((question) => [
        question.text, question.hint, question.hidePercent === true, Boolean(question.img),
        (question.answers ?? []).map((answer) => [answer.text, answer.isCorrect === true]),
      ]),
      conclusion: doc.data?.conclusion,
    }),
    project: (doc) => {
      const statsQuestions = doc.stats?.statsQuestions ?? {};
      const scoreDistribution = doc.stats?.statsGlobal?.scoreDistribution ?? {};
      return {
        title: doc.data?.title ?? '',
        questions: (doc.data?.questions ?? []).map((question, index) => {
          // Anciens quiz : statistiques en tableau par position (specs/002 research R3).
          const counts = (Array.isArray(statsQuestions) ? statsQuestions[index] : statsQuestions[question.id]) ?? {};
          return {
            id: question.id ?? null,
            text: question.text ?? '',
            hint: question.hint ?? '',
            img: question.img ?? '',
            hidePercent: question.hidePercent === true,
            answers: (question.answers ?? []).map((answer) => ({ text: answer.text ?? '', isCorrect: answer.isCorrect === true })),
            correct: Number(counts.correct) || 0,
            incorrect: Number(counts.incorrect) || 0,
          };
        }),
        conclusion: {
          text1: doc.data?.conclusion?.text1 ?? '',
          text2: doc.data?.conclusion?.text2 ?? '',
          text3: doc.data?.conclusion?.text3 ?? '',
        },
        plays: sum(Object.values(scoreDistribution)),
        scoreDistribution,
        views: Number(doc.stats?.views) || 0,
      };
    },
  },
};

export const RESOURCE_TYPES = Object.freeze(
  Object.fromEntries(Object.entries(FORMATS).map(([type, format]) => [format.resource, type])),
);

// Url d'image de quiz : https obligatoire (le téléchargement revérifie tout, ici on refuse tôt).
function imageUrlErrors(input) {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.flatMap((question, index) => {
    if (!isObject(question) || question.img === undefined || question.img === null || question.img === '') return [];
    let ok = false;
    try {
      ok = typeof question.img === 'string' && new URL(question.img).protocol === 'https:';
    } catch { /* URL invalide */ }
    return ok ? [] : [{ field: `questions[${index}].img`, code: 'invalid_value', message: `L'image de la question ${index + 1} doit être une URL https.` }];
  });
}

/** Corps JSON → entrée partagée du format ; toutes les violations réunies en une erreur `400`. */
export function parseCreateRequest(type, body) {
  const format = FORMATS[type];
  if (!isObject(body)) {
    throw validationFailed([{ field: 'body', code: 'invalid_type', message: 'Le corps doit être un objet JSON.' }]);
  }
  const errors = unknownFields(body, format.fields);
  const input = format.parse(body, errors);
  errors.push(...format.validate(input));
  if (type === 'quiz') errors.push(...imageUrlErrors(input));
  errors.push(...authorErrors(body.author));
  if (errors.length > 0) throw validationFailed(errors);
  return { input, author: body.author ?? DEFAULT_AUTHOR };
}

// Id déterministe propre à (appelant, format, clé) — research R2. Les sondages gardent leur formule.
const idempotentId = (callerEmail, type, key) =>
  createHash('sha256').update(`${callerEmail}\n${type}\n${key}`).digest('hex').slice(0, 20);

function sameContent(format, type, stored, requested) {
  return stored?.type === type
    && stored.meta?.brand === requested.meta.brand
    && stored.meta?.theme === requested.meta.theme
    && stored.meta?.author === requested.meta.author
    && JSON.stringify(format.fingerprint(stored)) === JSON.stringify(format.fingerprint(requested));
}

const conflict = (noun, stored) => new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key déjà utilisée', {
  detail: stored
    ? `Cette clé a déjà créé un ${noun} au contenu différent (ou modifié depuis dans le dashboard).`
    : `Cette clé a déjà servi pour un ${noun} supprimé depuis.`,
});

/** Télécharge, convertit et copie les images de quiz ; nettoie tout en cas d'échec. */
async function copyQuizImages(input, { images, imageStore }) {
  const copied = [];
  const questions = [];
  try {
    for (const [index, question] of input.questions.entries()) {
      if (!question.img) {
        questions.push(question);
        continue;
      }
      let webp;
      try {
        webp = await images.convert(await images.fetch(question.img));
      } catch (error) {
        if (error instanceof ImageError) {
          throw validationFailed([{ field: `questions[${index}].img`, code: 'invalid_value', message: `Question ${index + 1} : ${error.message}` }]);
        }
        throw error;
      }
      const stored = await imageStore.put(webp, 'quizs');
      copied.push(stored.path);
      questions.push({ ...question, img: stored.url });
    }
  } catch (error) {
    await removeAll(copied, imageStore);
    throw error;
  }
  return { input: { ...input, questions }, copied };
}

async function removeAll(paths, imageStore) {
  await Promise.allSettled(paths.map((path) => imageStore.remove(path)));
}

/**
 * Création d'un calendrier, tinder ou quiz. Idempotence : l'existence de l'id est vérifiée avant
 * de copier la moindre image ; une course perdue à l'écriture supprime les images copiées.
 *
 * @returns {Promise<{ status: 200 | 201, body: { id: string, embedUrl: string }, replayed: boolean }>}
 */
export async function createWidget(type, { input, author, caller, idempotencyKey }, { store, clientBaseUrl, images, imageStore }) {
  const format = FORMATS[type];
  const id = idempotencyKey ? idempotentId(caller.email, type, idempotencyKey) : store.newId();
  const body = { id, embedUrl: buildEmbedUrl({ type, id }, clientBaseUrl) };
  const toDoc = (data) => transformWidgetData(
    { ...format.build(data, store), id, author, deleted: false },
    { serverTimestamp: store.serverTimestamp },
  );

  // Rejeu : comparé sur le contenu, sans télécharger d'image (seule la présence compte).
  const replayOrConflict = async (known) => {
    const stored = known === undefined ? await store.get(id) : known;
    if (!stored) return null;
    if (sameContent(format, type, stored, toDoc(input))) return { status: 200, body, replayed: true };
    throw conflict(format.noun, stored);
  };
  if (idempotencyKey) {
    const replay = await replayOrConflict();
    if (replay) return replay;
  }

  let ready = input;
  let copied = [];
  if (type === 'quiz') ({ input: ready, copied } = await copyQuizImages(input, { images, imageStore }));

  try {
    await store.create(id, toDoc(ready));
    return { status: 201, body, replayed: false };
  } catch (error) {
    await removeAll(copied, imageStore);
    if (!(error instanceof AlreadyExistsError) || !idempotencyKey) throw error;
    const stored = await store.get(id);
    const replay = await replayOrConflict(stored);
    if (replay) return replay;
    throw conflict(format.noun, null);
  }
}

/** Lecture d'un calendrier, tinder ou quiz ; `404` si absent ou d'un autre format. */
export async function getWidget(type, { id }, { store, clientBaseUrl }) {
  const format = FORMATS[type];
  const doc = await store.get(id);
  if (!doc || doc.type !== type) throw new ApiError(404, 'NOT_FOUND', `${format.noun[0].toUpperCase()}${format.noun.slice(1)} introuvable`);
  const widgetId = doc.meta?.id || id;
  return {
    id: widgetId,
    embedUrl: buildEmbedUrl({ type, id: widgetId }, clientBaseUrl),
    ...format.project(doc),
    theme: doc.meta?.theme ?? '',
    brand: doc.meta?.brand || DEFAULT_BRAND,
  };
}
