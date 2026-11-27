// Widgets du Studio hors sondages (specs/002-hub-widgets-api, specs/005-hub-all-formats) :
// création et lecture, sur le modèle de `POST/GET /polls`. Validation et construction viennent de
// `@rms/widget-model` (mêmes documents que le dashboard) ; ce module ne fait que traduire la
// requête, gérer l'idempotence, les images et la projection de lecture.

import { createHash } from 'node:crypto';
import {
  validateCalendar, buildCalendarSaveData,
  validateTinder, buildTinderSaveData,
  validateQuiz, buildQuizSaveData,
  validateTeaser, buildTeaserSaveData,
  validateFolder, buildFolderSaveData,
  validateNatinotes, buildNatinotesSaveData,
  validatePotm, buildPotmSaveData,
  validateFacts, buildFactsSaveData,
  validateProno, buildPronoSaveData,
  validateTestimony, buildTestimonySaveData,
  transformWidgetData, buildEmbedUrl, DEFAULT_BRAND, requestFieldKeys, widgetForm,
} from '@rms/widget-model';
import { ApiError, AlreadyExistsError, validationFailed } from './errors.js';
import { DEFAULT_AUTHOR, authorErrors } from './polls.js';
import { formatDate, parseDate, parseDateTime } from './dates.js';
import { ImageError } from './images.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isMissing = (value) => value === undefined || value === null || value === '';

/** Champs inconnus d'un objet (corps ou élément imbriqué) → erreurs `unknown_field`. */
function unknownFields(object, allowed, prefix = '') {
  if (!isObject(object)) return [];
  return Object.keys(object)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ field: `${prefix}${key}`, code: 'unknown_field', message: `Champ inconnu : ${prefix}${key}.` }));
}

/**
 * Champs inconnus des objets imbriqués, chemin par chemin de `requestFieldKeys(type).nested`
 * (`questions`, puis `questions.answers`…) : listes parcourues élément par élément.
 */
function unknownNestedFields(body, nested) {
  const errors = [];
  const visit = (node, [key, ...rest], prefix, allowed) => {
    if (!isObject(node)) return;
    const value = node[key];
    const targets = Array.isArray(value)
      ? value.map((item, index) => [item, `${prefix}${key}[${index}].`])
      : [[value, `${prefix}${key}.`]];
    for (const [item, at] of targets) {
      if (rest.length === 0) errors.push(...unknownFields(item, allowed, at));
      else visit(item, rest, at, allowed);
    }
  };
  for (const [path, allowed] of Object.entries(nested)) visit(body, path.split('.'), '', allowed);
  return errors;
}

const toDate = (timestamp) => {
  if (!timestamp) return null;
  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : timestamp;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
};
const toIso = (timestamp) => toDate(timestamp)?.toISOString() ?? null;
const toDay = (timestamp) => {
  const date = toDate(timestamp);
  return date ? formatDate(date) : null;
};

/** Date seule de la requête → `Date` à midi heure suisse ; illisible → `Invalid Date` (refusée par la validation). */
const dateInput = (value) => (isMissing(value) ? value : (parseDate(value) ?? new Date(NaN)));
/** Date et heure suisses de la requête → `Date` ; illisible → `Invalid Date` (refusée par la validation). */
const dateTimeInput = (value) => (isMissing(value) ? value : (parseDateTime(value) ?? new Date(NaN)));

const count = (value) => Number(value) || 0;
const sum = (values) => values.reduce((total, value) => total + count(value), 0);
const counts = (map) => Object.fromEntries(Object.entries(isObject(map) ? map : {}).map(([key, value]) => [key, count(value)]));

// Titres sur plusieurs lignes : stockés avec des `\n` littéraux (TeaserForm.jsx, FolderForm.jsx).
const withLineBreaks = (text) => (text ?? '').replace(/\\n/g, '\n');

const has = (object, key) => Object.hasOwn(object, key);

// ---------------------------------------------------------------------------------------------
// Un format = sa traduction de requête, sa validation/construction partagées, sa projection.
// `context` (facultatif) : données lues avant la validation (effectifs des notes des joueurs).
// ---------------------------------------------------------------------------------------------

const FORMAT_RULES = {
  calendar: {
    parse(body) {
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
      views: count(doc.stats?.views),
      seeAllClicks: count(doc.stats?.seeAllClicks),
    }),
  },

  tinder: {
    parse(body, errors) {
      // Légende du dashboard : un texte fourni est affiché sous les cartes.
      let legend;
      if (body.legend !== undefined && body.legend !== null && body.legend !== '') {
        if (typeof body.legend === 'string') legend = { txt: body.legend, display: true };
        else errors.push({ field: 'legend', code: 'invalid_type', message: 'La légende doit être une chaîne de caractères.' });
      }
      return { theme: body.theme, brand: body.brand, label: body.label, title: body.title, cards: body.cards, legend };
    },
    validate: validateTinder,
    build: (input) => buildTinderSaveData(input),
    fingerprint: (doc) => ({
      label: doc.data?.tinderLabel,
      title: doc.data?.tinderTitle,
      cards: (doc.data?.tinderCards ?? []).map((card) => [card.tinderCardLabel, card.tinderCardTitle]),
      legend: [doc.data?.tinderLegend?.txt ?? '', doc.data?.tinderLegend?.display === true],
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
          yes: count(votes[card.id]?.yes),
          no: count(votes[card.id]?.no),
        })),
        legend: doc.data?.tinderLegend?.display === true ? (doc.data.tinderLegend.txt ?? '') : null,
        views: count(doc.stats?.views),
      };
    },
  },

  quiz: {
    parse: (body) => ({ theme: body.theme, brand: body.brand, title: body.title, questions: body.questions, conclusion: body.conclusion }),
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
          const stats = (Array.isArray(statsQuestions) ? statsQuestions[index] : statsQuestions[question.id]) ?? {};
          return {
            id: question.id ?? null,
            text: question.text ?? '',
            hint: question.hint ?? '',
            img: question.img ?? '',
            hidePercent: question.hidePercent === true,
            answers: (question.answers ?? []).map((answer) => ({ text: answer.text ?? '', isCorrect: answer.isCorrect === true })),
            correct: count(stats.correct),
            incorrect: count(stats.incorrect),
          };
        }),
        conclusion: {
          text1: doc.data?.conclusion?.text1 ?? '',
          text2: doc.data?.conclusion?.text2 ?? '',
          text3: doc.data?.conclusion?.text3 ?? '',
        },
        plays: sum(Object.values(scoreDistribution)),
        scoreDistribution,
        views: count(doc.stats?.views),
      };
    },
  },

  teaser: {
    parse: (body) => ({ theme: body.theme, brand: body.brand, label: body.label, title: body.title, img: body.img, button: body.button }),
    validate: validateTeaser,
    build: (input) => buildTeaserSaveData(input),
    fingerprint: (doc) => ({
      label: doc.data?.label,
      title: doc.data?.title,
      img: Boolean(doc.data?.img),
      button: [doc.data?.linkGlobalTxt ?? '', doc.data?.linkGlobalHref ?? '', doc.data?.linkGlobalNewTab === true],
    }),
    project: (doc) => ({
      label: doc.data?.label ?? '',
      title: withLineBreaks(doc.data?.title),
      img: doc.data?.img ?? '',
      button: { text: doc.data?.linkGlobalTxt ?? '', href: doc.data?.linkGlobalHref ?? '', newTab: doc.data?.linkGlobalNewTab === true },
      views: count(doc.stats?.views),
      clicks: count(doc.stats?.clicks),
    }),
  },

  folder: {
    parse: (body) => ({
      theme: body.theme, brand: body.brand, label: body.label, labelColor: body.labelColor, name: body.name, img: body.img, buttons: body.buttons,
    }),
    validate: validateFolder,
    build: (input) => buildFolderSaveData(input),
    fingerprint: (doc) => ({
      label: doc.data?.folderLabel,
      labelColor: doc.data?.folderLabelColor,
      name: doc.data?.folderName,
      img: Boolean(doc.data?.img),
      buttons: (doc.data?.buttons ?? []).map((button) => [button.buttonTxt, button.buttonUrl, button.buttonOpensNewTab === true]),
    }),
    project: (doc) => {
      const clicks = doc.stats?.buttonClicks ?? {};
      return {
        label: doc.data?.folderLabel ?? '',
        labelColor: (doc.data?.folderLabelColor || 'bg-brand').replace(/^bg-/, ''),
        name: withLineBreaks(doc.data?.folderName),
        img: doc.data?.img ?? '',
        buttons: (doc.data?.buttons ?? []).map((button) => ({
          id: button.id ?? null,
          text: button.buttonTxt ?? '',
          href: button.buttonUrl ?? '',
          newTab: button.buttonOpensNewTab === true,
          clicks: count(clicks[button.id]),
        })),
        views: count(doc.stats?.views),
      };
    },
  },

  natinotes: {
    // Les joueurs viennent des effectifs (collection `teams`), lus avant la validation.
    context: async (store) => ({ teams: await store.listTeams() }),
    parse: (body) => ({ theme: body.theme, brand: body.brand, title: body.title, showRecap: body.showRecap, players: body.players }),
    validate: validateNatinotes,
    build: (input, store, context) => buildNatinotesSaveData(input, context),
    fingerprint: (doc) => ({
      title: doc.data?.title,
      showRecap: doc.data?.showRecap !== false,
      players: (doc.data?.players ?? []).map((player) => [player.id, player.blickRating, player.comment]),
    }),
    project: (doc) => {
      const ratings = doc.stats?.playerRatings ?? {};
      return {
        title: doc.data?.title ?? '',
        showRecap: doc.data?.showRecap !== false,
        players: (doc.data?.players ?? []).map((player) => ({
          id: player.id ?? null,
          name: player.name ?? '',
          team: player.team ?? '',
          img: player.img ?? null,
          blickRating: player.blickRating ?? null,
          comment: player.comment ?? '',
          // Notes des lecteurs : nombre de votes par note (« 1 » à « 6 »).
          ratings: counts(ratings[player.id]),
        })),
        views: count(doc.stats?.views),
      };
    },
  },

  potm: {
    parse: (body) => ({
      theme: body.theme, brand: body.brand, context: body.context, category: body.category, text: body.text,
      date: dateInput(body.date), players: body.players,
    }),
    validate: validatePotm,
    build: (input, store) => buildPotmSaveData(input, { toTimestamp: store.toTimestamp }),
    fingerprint: (doc) => ({
      context: [doc.data?.context?.context, doc.data?.context?.category, doc.data?.context?.text, toIso(doc.data?.context?.date)],
      players: (doc.data?.players ?? []).map((player) => [player.name, player.position, player.team]),
    }),
    project: (doc) => {
      const votes = doc.stats?.playersVotes ?? {};
      return {
        context: doc.data?.context?.context ?? '',
        category: doc.data?.context?.category ?? '',
        text: doc.data?.context?.text ?? '',
        date: toDay(doc.data?.context?.date),
        players: (doc.data?.players ?? []).map((player, index) => ({
          id: player.id ?? null,
          name: player.name ?? '',
          position: player.position ?? '',
          team: player.team ?? '',
          // Anciens joueurs du match : votes par position.
          votes: count(votes[player.id] ?? votes[index]),
        })),
        views: count(doc.stats?.views),
      };
    },
  },

  facts: {
    parse: (body) => ({ theme: body.theme, brand: body.brand, title: body.title, date: dateInput(body.date), items: body.items }),
    validate: validateFacts,
    build: (input, store) => buildFactsSaveData(input, { toTimestamp: store.toTimestamp }),
    fingerprint: (doc) => ({
      title: doc.data?.title,
      date: toIso(doc.data?.date),
      items: (doc.data?.items ?? []).map((item) => [
        item.type, item.icon, item.title, item.text, item.author, Boolean(item.picture), Boolean(item.src), item.caption, item.value,
      ]),
    }),
    project: (doc) => ({
      title: doc.data?.title ?? '',
      date: toDay(doc.data?.date),
      items: (doc.data?.items ?? []).map((item) => ({
        id: item.id ?? null,
        type: item.type ?? 'normal',
        icon: item.icon ?? '',
        title: item.title ?? '',
        text: item.text ?? '',
        ...(has(item, 'author') && { author: item.author }),
        ...(has(item, 'picture') && { picture: item.picture }),
        ...(has(item, 'src') && { src: item.src }),
        ...(has(item, 'caption') && { caption: item.caption }),
        ...(has(item, 'value') && { value: item.value }),
      })),
      views: count(doc.stats?.views),
      reveal: count(doc.stats?.reveal),
      // Avis des lecteurs sur l'item `rating` : nombre de votes par note.
      ratingStats: counts(doc.stats?.ratingStats),
    }),
  },

  prono: {
    parse: (body) => ({
      theme: body.theme, brand: body.brand, event: body.event, date: dateInput(body.date), team1: body.team1, team2: body.team2,
    }),
    validate: validateProno,
    build: (input, store) => buildPronoSaveData(input, { toTimestamp: store.toTimestamp }),
    fingerprint: (doc) => ({
      event: doc.data?.pronoData?.event,
      date: toIso(doc.data?.pronoData?.date),
      teams: [doc.data?.pronoData?.item1?.name, doc.data?.pronoData?.item2?.name],
    }),
    project: (doc) => {
      const prono = doc.data?.pronoData ?? {};
      // Anciens pronostics : votes dans chaque issue.
      const votes = (key) => count(doc.stats?.itemVotes?.[key] ?? prono[key]?.votes);
      return {
        event: prono.event ?? '',
        date: toDay(prono.date),
        team1: prono.item1?.name ?? '',
        team2: prono.item2?.name ?? '',
        // Votes des lecteurs : victoire de l'équipe 1, de l'équipe 2, match nul.
        votes: { team1: votes('item1'), team2: votes('item2'), draw: votes('item3') },
        views: count(doc.stats?.views),
      };
    },
  },

  testimony: {
    parse: (body) => ({
      theme: body.theme, brand: body.brand, title: body.title, subject: body.subject, question: body.question,
      timeExpires: dateTimeInput(body.timeExpires),
    }),
    validate: validateTestimony,
    build: (input, store) => buildTestimonySaveData(input, { toTimestamp: store.toTimestamp }),
    fingerprint: (doc) => ({
      texts: [doc.data?.title, doc.data?.subject, doc.data?.question],
      timeExpires: toIso(doc.data?.timeExpires),
    }),
    // Les messages des lecteurs (sous-collection `messages`, données personnelles) ne sont jamais lus.
    project: (doc) => ({
      title: doc.data?.title ?? '',
      subject: doc.data?.subject ?? '',
      question: doc.data?.question ?? '',
      timeExpires: toIso(doc.data?.timeExpires),
      views: count(doc.stats?.views),
      msgSent: count(doc.stats?.msgSent),
    }),
  },
};

/** Le formulaire décrit-il au moins un champ image (listes et variantes comprises) ? */
const hasImageField = (fields = []) => fields.some((field) => field.kind === 'image'
  || hasImageField(field.fields)
  || (field.variants?.options ?? []).some((option) => hasImageField(option.fields)));

const FORMATS = Object.fromEntries(Object.entries(FORMAT_RULES).map(([type, rules]) => {
  const form = widgetForm(type);
  if (hasImageField(form.fields) && !form.images?.prefix) throw new Error(`Format ${type} : champ image sans préfixe (images.prefix)`);
  return [type, { ...rules, form, resource: form.resource, noun: form.noun, keys: requestFieldKeys(type), imagePrefix: form.images?.prefix ?? null }];
}));

export const RESOURCE_TYPES = Object.freeze(
  Object.fromEntries(Object.entries(FORMATS).map(([type, format]) => [format.resource, type])),
);

/**
 * Corps JSON → entrée partagée du format ; toutes les violations réunies en une erreur `400`.
 * @returns {Promise<{ input: object, author: string, context?: object }>}
 */
export async function parseCreateRequest(type, body, { store }) {
  const format = FORMATS[type];
  if (!isObject(body)) {
    throw validationFailed([{ field: 'body', code: 'invalid_type', message: 'Le corps doit être un objet JSON.' }]);
  }
  const errors = [...unknownFields(body, format.keys.root), ...unknownNestedFields(body, format.keys.nested)];
  const input = format.parse(body, errors);
  const context = format.context ? await format.context(store) : undefined;
  errors.push(...format.validate(input, context));
  errors.push(...authorErrors(body.author));
  if (errors.length > 0) throw validationFailed(errors);
  return { input, author: body.author ?? DEFAULT_AUTHOR, context };
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

/**
 * Images de l'entrée, dans l'ordre du formulaire : champs `image` de la description, y compris
 * dans les listes, les groupes et les variantes d'éléments. Seules les valeurs non vides comptent.
 * @returns {{ field: string, where: string, set: (url: string) => void, value: string }[]}
 */
function imageSlots(fields, node, at = '', where = null) {
  if (!isObject(node)) return [];
  return fields.flatMap((field) => {
    const value = node[field.key];
    const path = `${at}${field.key}`;
    if (field.kind === 'image') {
      return typeof value === 'string' && value !== ''
        ? [{ field: path, where: where ?? field.label, value, set: (url) => { node[field.key] = url; } }]
        : [];
    }
    if (field.kind === 'group') return imageSlots(field.fields ?? [], value, `${path}.`, where);
    if (field.kind === 'list' && Array.isArray(value)) {
      return value.flatMap((item, index) => {
        const variant = field.variants?.options.find((option) => option.value === item?.[field.variants.key]);
        const itemFields = [...(field.fields ?? []), ...(variant?.fields ?? [])];
        return imageSlots(itemFields, item, `${path}[${index}].`, `${field.itemLabel ?? field.label} ${index + 1}`);
      });
    }
    return [];
  });
}

/**
 * Image → URL d'une image du Storage de l'environnement, sous le préfixe du format. Image déjà chez
 * nous : gardée, ou copiée si c'est un envoi `POST /images` ; sinon téléchargée, convertie et copiée.
 * @returns {Promise<{ url: string, path?: string }>} `path` = objet créé, à nettoyer si échec
 */
async function importImage(img, prefix, { images, imageStore }) {
  const adopted = await imageStore.adopt(img, prefix);
  if (adopted) return adopted;
  return imageStore.put(await images.convert(await images.fetch(img)), prefix);
}

/** Images du widget dans le Storage de l'environnement ; nettoie tout en cas d'échec. */
async function copyImages(format, input, deps) {
  const ready = structuredClone(input);
  const copied = [];
  try {
    for (const slot of imageSlots(format.form.fields, ready)) {
      let image;
      try {
        image = await importImage(slot.value, format.imagePrefix, deps);
      } catch (error) {
        if (error instanceof ImageError) {
          throw validationFailed([{ field: slot.field, code: 'invalid_value', message: `${slot.where} : ${error.message}` }]);
        }
        throw error;
      }
      if (image.path) copied.push(image.path);
      slot.set(image.url);
    }
  } catch (error) {
    await removeAll(copied, deps.imageStore);
    throw error;
  }
  return { input: ready, copied };
}

async function removeAll(paths, imageStore) {
  await Promise.allSettled(paths.map((path) => imageStore.remove(path)));
}

/**
 * Création d'un widget. Idempotence : l'existence de l'id est vérifiée avant de copier la moindre
 * image ; une course perdue à l'écriture supprime les images copiées.
 *
 * @returns {Promise<{ status: 200 | 201, body: { id: string, embedUrl: string }, replayed: boolean }>}
 */
export async function createWidget(type, { input, author, context, caller, idempotencyKey }, { store, clientBaseUrl, images, imageStore }) {
  const format = FORMATS[type];
  const id = idempotencyKey ? idempotentId(caller.email, type, idempotencyKey) : store.newId();
  const body = { id, embedUrl: buildEmbedUrl({ type, id }, clientBaseUrl) };
  const toDoc = (data) => transformWidgetData(
    { ...format.build(data, store, context), id, author, deleted: false },
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
  if (format.imagePrefix) ({ input: ready, copied } = await copyImages(format, input, { images, imageStore }));

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

/** Lecture d'un widget ; `404` si absent ou d'un autre format. */
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
