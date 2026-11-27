import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import {
  transformWidgetData, buildCalendarSaveData, buildTinderSaveData, buildQuizSaveData,
  buildTeaserSaveData, buildFolderSaveData, buildNatinotesSaveData, buildPotmSaveData, buildFactsSaveData,
  buildPronoSaveData, buildTestimonySaveData,
  listTeamsForPicker, potmTeamsForContext, WIDGET_FORMS, PRONO_TEAMS, PRONO_COMPETITIONS,
} from '@rms/widget-model';
import { createApp } from '../src/app.js';
import { createCallerVerifier } from '../src/auth.js';
import { AlreadyExistsError } from '../src/errors.js';
import { ImageError, fetchImageSafely, isPublicAddress, toDashboardWebp, IMAGE_TARGET_BYTES } from '../src/images.js';
import { UPLOAD_PREFIX, parseStorageUrl } from '../src/imageStore.js';
import { parseDate, parseDateTime } from '@rms/widget-model';

const AUDIENCE = 'https://blick-tools-api.test';
const BASE = 'https://example.test/bl-tools-client-';
const HUB = 'hub@hub-project.iam.gserviceaccount.com';
const TS = 'server-timestamp';

const TOKENS = {
  hub: { email: HUB, email_verified: true },
  stranger: { email: 'intrus@evil.iam.gserviceaccount.com', email_verified: true },
};
const fakeOidcClient = {
  async getFederatedSignonCertsAsync() { return { certs: {} }; },
  async verifyIdToken({ idToken, audience }) {
    if (!TOKENS[idToken] || audience !== AUDIENCE) throw new Error('bad token');
    return { getPayload: () => TOKENS[idToken] };
  },
};

// Horodatage factice : se comporte comme un Timestamp Firestore (`toDate()`).
const fakeTimestamp = (date) => ({ toDate: () => new Date(date.getTime()) });

// Effectifs (collection `teams`) : un joueur archivé, des équipes et joueurs dans le désordre.
const TEAMS = [
  {
    id: 'suisse-m-football',
    name: 'Suisse M – Football',
    players: [
      { id: 'yann-sommer', name: 'Yann Sommer', team: 'Suisse', img: null, archived: true },
      { id: 'granit-xhaka', name: 'Granit Xhaka', team: 'Suisse', img: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/portraits%2Fx.webp?alt=media&token=t', focal: { x: 40, y: 10, zoom: 1.5 } },
      { id: 'breel-embolo', name: 'Breel Embolo' },
    ],
  },
  { id: 'albanie', name: 'Albanie', players: [{ id: 'armando-broja', name: 'Armando Broja', team: 'Albanie' }] },
];

let docs;
let nextId;
let failNextCreate;
let beforeUpdate; // écriture concurrente simulée entre la lecture préalable et la transaction
let clock;
const store = {
  serverTimestamp: () => TS,
  toTimestamp: fakeTimestamp,
  newId: () => `auto${++nextId}`,
  async create(id, doc) {
    if (failNextCreate) { failNextCreate = false; throw new Error('boom'); }
    if (docs.has(id)) throw new AlreadyExistsError();
    docs.set(id, doc);
  },
  async get(id) { return docs.get(id) ?? null; },
  async listTeams() { return structuredClone(TEAMS); },
  now: () => fakeTimestamp(new Date(Date.UTC(2026, 10, 27, 12, 0, ++clock))),
  // Transaction en mémoire : relit le document, applique les blocs de premier niveau du `patch`.
  async update(id, compute) {
    beforeUpdate?.();
    const result = compute(docs.get(id) ?? null);
    if (result?.patch) docs.set(id, { ...docs.get(id), ...result.patch });
    return result;
  },
};

// Images : téléchargement factice ; conversion réelle sauf pour le contenu factice « image » ;
// stockage en mémoire (objet → jeton), même forme d'URL que Firebase.
const BUCKET = 'bucket';
const storageUrl = (path, token = 't') => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
let fetched;
let stored;
let removed;
let objects;
const images = {
  async fetch(url) {
    fetched.push(url);
    if (url.includes('broken')) throw new ImageError("L'image n'a pas pu être téléchargée (HTTP 404).");
    return Buffer.from(url.includes('notimage') ? 'pas une image' : 'image');
  },
  async convert(buffer, options) {
    return buffer.toString() === 'image' ? Buffer.from('webp') : toDashboardWebp(buffer, options);
  },
};
const imageStore = {
  async put(webp, prefix) {
    const path = `${prefix}/${stored.length + 1}.webp`;
    stored.push(path);
    objects.set(path, 't');
    return { url: storageUrl(path), path };
  },
  async adopt(url, prefix) {
    const location = parseStorageUrl(url, BUCKET);
    if (!location) return null;
    if (objects.get(location.path) !== location.token) throw new ImageError('Image introuvable dans le stockage Blick Tools.');
    return location.path.startsWith(`${UPLOAD_PREFIX}/`) ? this.put(Buffer.from('webp'), prefix) : { url };
  },
  async remove(path) { removed.push(path); objects.delete(path); },
};

let server;
let url;
before(async () => {
  server = http.createServer(createApp({
    verifyCaller: createCallerVerifier({ audience: AUDIENCE, allowedCallers: new Set([HUB]), client: fakeOidcClient }),
    store, clientBaseUrl: BASE, images, imageStore, log: () => {},
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  docs = new Map(); nextId = 0; failNextCreate = false; fetched = []; stored = []; removed = []; objects = new Map();
  beforeUpdate = undefined; clock = 0;
});

async function call(method, path, body, { token = 'hub', headers = {} } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, json: await response.json() };
}
const fields = (res) => res.json.errors.map(({ field, code }) => [field, code]);
// Lecture sans le formulaire de modification ni la version (vérifiés par les tests de `PUT`).
const projection = ({ form, version, ...rest }) => rest;

const CALENDAR = {
  title: ' Coupe du monde ', theme: 'Sport',
  dates: [{ text: 'Finale', complement: 'Lusail', start: '2026-12-20T20:45' }, { text: 'Demie', start: '2026-07-01T18:00:00Z' }],
  linkGlobal: { text: 'Programme', href: 'https://blick.ch', newTab: true },
};
const TINDER = { label: 'Débat', title: 'Pour ou contre ?', theme: 'Suisse', cards: [{ label: 'A', title: 'Un' }, { label: 'B', title: 'Deux' }, { label: 'C', title: 'Trois' }] };
const answers = (correct) => ['3', '4', '5', '22'].map((text, i) => (i === correct ? { text, isCorrect: true } : { text }));
const QUIZ = {
  title: 'Quiz', theme: 'Inter', author: 'jane@ringier.ch',
  questions: [{ text: '2+2 ?', answers: answers(1), img: 'https://images.ringier.ch/a.jpg' }, { text: '3+3 ?', answers: answers(0), hint: 'pair' }],
  conclusion: { text1: 'Raté', text2: 'Pas mal', text3: 'Bravo' },
};

// ---------------------------------------------------------------- création

test('POST /calendars : 201, document de la fabrique partagée, heure suisse par défaut', async () => {
  const res = await call('POST', '/calendars', CALENDAR);
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { id: 'auto1', embedUrl: `${BASE}calendar/?calendarDoc=auto1` });

  const doc = docs.get('auto1');
  const expected = transformWidgetData(
    { ...buildCalendarSaveData({ ...CALENDAR, dates: CALENDAR.dates.map((d) => ({ ...d, start: parseDateTime(d.start) })) }, { toTimestamp: fakeTimestamp }), id: 'auto1', author: 'Hub Rédaction', deleted: false },
    { serverTimestamp: () => TS },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), JSON.parse(JSON.stringify(expected)));
  assert.equal(doc.data.dates[0].scheduleStart.toDate().toISOString(), '2026-12-20T19:45:00.000Z'); // 20:45 en hiver = UTC+1
  assert.equal(doc.data.dates[1].scheduleStart.toDate().toISOString(), '2026-07-01T18:00:00.000Z');
  assert.equal(doc.data.nbElemsToShow, 100);
  assert.deepEqual(doc.stats, { views: 0, seeAllClicks: 0 });
});

test('POST /tinders : ids de cartes et votes par id, légende facultative affichée', async () => {
  const res = await call('POST', '/tinders', TINDER);
  assert.equal(res.status, 201);
  assert.equal(res.json.embedUrl, `${BASE}tinder/?tinderDoc=auto1`);
  const doc = docs.get('auto1');
  const ids = doc.data.tinderCards.map((card) => card.id);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(doc.stats.tinderVotes, Object.fromEntries(ids.map((id) => [id, { yes: 0, no: 0 }])));
  const expected = transformWidgetData({ ...buildTinderSaveData({ ...TINDER, cards: TINDER.cards.map((c, i) => ({ ...c, id: ids[i] })) }), id: 'auto1', author: 'Hub Rédaction', deleted: false }, { serverTimestamp: () => TS });
  assert.deepEqual(doc, expected);
  assert.equal((await call('GET', '/tinders/auto1')).json.legend, null);

  const withLegend = await call('POST', '/tinders', { ...TINDER, legend: ' Glisse à droite pour oui ' });
  assert.deepEqual(docs.get(withLegend.json.id).data.tinderLegend, { txt: 'Glisse à droite pour oui', display: true });
  assert.equal((await call('GET', `/tinders/${withLegend.json.id}`)).json.legend, 'Glisse à droite pour oui');
});

test('POST /tinders : 1 ou 2 cartes refusées comme dans le dashboard', async () => {
  for (const count of [1, 2]) {
    const res = await call('POST', '/tinders', { ...TINDER, cards: TINDER.cards.slice(0, count) });
    assert.equal(res.status, 400);
    assert.deepEqual(res.json.errors, [{ field: 'cards', code: 'too_few', message: 'Le tinder doit avoir exactement 3 cartes.' }]);
  }
  assert.equal(docs.size, 0);
});

test('POST /quizzes : image copiée dans le Storage, URL d\'origine jamais stockée', async () => {
  const res = await call('POST', '/quizzes', QUIZ);
  assert.equal(res.status, 201);
  assert.equal(res.json.embedUrl, `${BASE}quiz/?quizDoc=auto1`);
  assert.deepEqual(fetched, ['https://images.ringier.ch/a.jpg']);
  const doc = docs.get('auto1');
  assert.equal(doc.data.questions[0].img, 'https://firebasestorage.googleapis.com/v0/b/bucket/o/quizs%2F1.webp?alt=media&token=t');
  assert.equal(doc.data.questions[1].img, '');
  assert.ok(!JSON.stringify(doc).includes('images.ringier.ch'));
  const ids = doc.data.questions.map((q) => q.id);
  assert.deepEqual(doc.stats.statsQuestions, Object.fromEntries(ids.map((id) => [id, { correct: 0, incorrect: 0 }])));
  assert.deepEqual(doc.stats.statsGlobal, { scoreDistribution: { 0: 0, 1: 0, 2: 0 } });
  assert.equal(doc.meta.author, 'jane@ringier.ch');
  const expected = transformWidgetData({
    ...buildQuizSaveData({ ...QUIZ, questions: QUIZ.questions.map((q, i) => ({ ...q, id: ids[i], img: doc.data.questions[i].img })) }),
    id: 'auto1', author: 'jane@ringier.ch', deleted: false,
  }, { serverTimestamp: () => TS });
  assert.deepEqual(doc, expected);
});

// ---------------------------------------------------------------- refus

test('400 groupé par format, avec champs imbriqués inconnus et marque pme refusée', async () => {
  const cal = await call('POST', '/calendars', { title: ' ', theme: 'Sport', brand: 'pme', dates: [{ text: 'x', start: '2026-12-20' }, { text: '', start: '2026-03-29T02:30', end: 'x' }], linkGlobal: { href: 'https://a' } });
  assert.equal(cal.status, 400);
  assert.deepEqual(fields(cal), [
    ['dates[1].end', 'unknown_field'],
    ['title', 'required'],
    ['dates[0].start', 'invalid_value'],
    ['dates[1].text', 'required'],
    ['dates[1].start', 'invalid_value'],
    ['linkGlobal.text', 'required'],
    ['brand', 'invalid_value'],
  ]);

  const tin = await call('POST', '/tinders', { ...TINDER, cards: [{ label: 'A', title: 'x', id: 'mine' }, ...[1, 2, 3].map(() => ({ label: 'a', title: 'b' }))], legend: 42 });
  assert.deepEqual(fields(tin), [['cards[0].id', 'unknown_field'], ['legend', 'invalid_type'], ['cards', 'too_many']]);

  const quiz = await call('POST', '/quizzes', { ...QUIZ, questions: [{ text: 'Q', answers: answers(1).slice(0, 3) }, { text: 'Q', answers: [...answers(0).slice(0, 3), { text: 'x', isCorrect: true }], img: 'http://insecure/a.jpg' }], conclusion: { text1: 'a' } });
  assert.deepEqual(fields(quiz), [
    ['questions[0].answers', 'invalid_value'],
    ['questions[1].img', 'invalid_value'],
    ['questions[1].correctAnswer', 'invalid_value'],
    ['conclusion.text2', 'required'],
    ['conclusion.text3', 'required'],
  ]);
  assert.equal(docs.size, 0);
  assert.deepEqual(fetched, []);
});

test('image injoignable ou illisible → 400 sur son champ, images déjà copiées supprimées', async () => {
  const res = await call('POST', '/quizzes', {
    ...QUIZ,
    questions: [QUIZ.questions[0], { ...QUIZ.questions[1], img: 'https://cdn.example/notimage.jpg' }],
  });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['questions[1].img', 'invalid_value']]);
  assert.match(res.json.errors[0].message, /^Question 2 : /);
  assert.deepEqual(stored, ['quizs/1.webp']);
  assert.deepEqual(removed, ['quizs/1.webp']);
  assert.equal(docs.size, 0);
});

test('échec de l\'écriture Firestore → images copiées supprimées, 500', async () => {
  failNextCreate = true;
  const res = await call('POST', '/quizzes', QUIZ);
  assert.equal(res.status, 500);
  assert.deepEqual(removed, ['quizs/1.webp']);
});

test('401 / 403 / 404 / 405 / 415 sur les nouvelles ressources', async () => {
  assert.equal((await call('POST', '/calendars', CALENDAR, { token: null })).status, 401);
  assert.equal((await call('POST', '/tinders', TINDER, { token: 'stranger' })).status, 403);
  assert.equal((await call('GET', '/quizzes/nope')).status, 404);
  const put = await call('PUT', '/calendars', CALENDAR);
  assert.equal(put.status, 405);
  assert.equal(put.headers.get('allow'), 'POST');
  const patch = await call('PATCH', '/tinders/x', {});
  assert.equal(patch.status, 405);
  assert.equal(patch.headers.get('allow'), 'GET, PUT');
  const form = await fetch(`${url}/calendars`, { method: 'POST', headers: { Authorization: 'Bearer hub', 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(form.status, 415);
});

// ---------------------------------------------------------------- envoi d'image (POST /images)

const upload = async (body, contentType, { token = 'hub' } = {}) => {
  const response = await fetch(`${url}/images`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(contentType && { 'Content-Type': contentType }) },
    body,
  });
  return { status: response.status, headers: response.headers, json: await response.json() };
};
const photo = () => sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#0a7' } }).jpeg().toBuffer();

test('POST /images : 201 { url }, image convertie comme le dashboard, déposée sous le préfixe des envois', async () => {
  const res = await upload(await photo(), 'image/jpeg');
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { url: storageUrl(`${UPLOAD_PREFIX}/1.webp`) });
  assert.deepEqual(stored, [`${UPLOAD_PREFIX}/1.webp`]);

  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
  assert.equal((await upload(gif, 'image/gif')).status, 201);
});

test('POST /images : type refusé, trop lourd, illisible → 400 sur « image »', async () => {
  const imageErrors = (res) => [res.status, ...res.json.errors.map(({ field, code }) => `${field}:${code}`)];
  const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).tiff().toBuffer();
  assert.deepEqual(imageErrors(await upload(tiff, 'image/tiff')), [400, 'image:invalid_type']);
  assert.deepEqual(imageErrors(await upload(tiff, 'image/png')), [400, 'image:invalid_type'], 'format réel vérifié');
  assert.deepEqual(imageErrors(await upload('<html></html>', 'image/jpeg')), [400, 'image:invalid_type']);
  assert.deepEqual(imageErrors(await upload(Buffer.alloc(0), 'image/jpeg')), [400, 'image:invalid_type']);
  assert.deepEqual(imageErrors(await upload(await photo(), undefined)), [400, 'image:invalid_type']);

  const tooLarge = await upload(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/jpeg');
  assert.deepEqual(imageErrors(tooLarge), [400, 'image:too_large']);
  assert.equal(tooLarge.json.errors[0].message, "L'image dépasse 10 Mo.");

  const noisy = Buffer.alloc(600 * 400 * 3);
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 7919) % 251;
  const jpeg = await sharp(noisy, { raw: { width: 600, height: 400, channels: 3 } }).jpeg().toBuffer();
  assert.deepEqual(imageErrors(await upload(jpeg.subarray(0, jpeg.length / 2), 'image/jpeg')), [400, 'image:invalid_value'], 'JPEG tronqué');
  assert.deepEqual(stored, []);
});

test('POST /images : 401 sans jeton, 403 hors liste blanche, 405 hors POST, rien de déposé', async () => {
  assert.equal((await upload(await photo(), 'image/jpeg', { token: null })).status, 401);
  assert.equal((await upload(await photo(), 'image/jpeg', { token: 'stranger' })).status, 403);
  const get = await fetch(`${url}/images`, { headers: { Authorization: 'Bearer hub' } });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.deepEqual(stored, []);
});

test('POST /quizzes : image envoyée par POST /images copiée sans téléchargement, image du Storage gardée', async () => {
  const sent = await upload(await photo(), 'image/jpeg');
  objects.set('quizs/dashboard.webp', 't');
  const res = await call('POST', '/quizzes', {
    ...QUIZ,
    questions: [{ ...QUIZ.questions[0], img: sent.json.url }, { ...QUIZ.questions[1], img: storageUrl('quizs/dashboard.webp') }],
  });
  assert.equal(res.status, 201);
  assert.deepEqual(fetched, []);
  const { questions } = docs.get(res.json.id).data;
  assert.equal(questions[0].img, storageUrl('quizs/2.webp'), 'copie sous quizs/, indépendante de l\'envoi');
  assert.equal(questions[1].img, storageUrl('quizs/dashboard.webp'));

  const expired = await call('POST', '/quizzes', { ...QUIZ, questions: [{ ...QUIZ.questions[0], img: storageUrl(`${UPLOAD_PREFIX}/expire.webp`) }] });
  assert.deepEqual(fields(expired), [['questions[0].img', 'invalid_value']]);
  const wrongToken = await call('POST', '/quizzes', { ...QUIZ, questions: [{ ...QUIZ.questions[0], img: storageUrl('quizs/dashboard.webp', 'devine') }] });
  assert.deepEqual(fields(wrongToken), [['questions[0].img', 'invalid_value']]);
});

test('parseStorageUrl : seules les URL de téléchargement du bucket de l\'environnement', () => {
  assert.deepEqual(parseStorageUrl(storageUrl('hub-uploads/a b.webp', 'k'), BUCKET), { path: 'hub-uploads/a b.webp', token: 'k' });
  for (const other of [
    'https://firebasestorage.googleapis.com/v0/b/autre/o/quizs%2Fa.webp?alt=media&token=t',
    'https://evil.example/v0/b/bucket/o/quizs%2Fa.webp?token=t',
    'http://firebasestorage.googleapis.com/v0/b/bucket/o/quizs%2Fa.webp?token=t',
    'pas une url',
  ]) assert.equal(parseStorageUrl(other, BUCKET), null, other);
});

// ---------------------------------------------------------------- idempotence

test('Idempotency-Key : rejeu sans recopier d\'image, contenu différent → 409, clé propre au format', async () => {
  const headers = { 'Idempotency-Key': 'article-1' };
  const first = await call('POST', '/quizzes', QUIZ, { headers });
  assert.equal(first.status, 201);
  assert.match(first.json.id, /^[0-9a-f]{20}$/);

  const replay = await call('POST', '/quizzes', QUIZ, { headers });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(replay.json, first.json);
  assert.equal(fetched.length, 1, 'aucun nouveau téléchargement au rejeu');
  assert.equal(stored.length, 1);

  const other = await call('POST', '/quizzes', { ...QUIZ, title: 'Autre' }, { headers });
  assert.equal(other.status, 409);

  const calendar = await call('POST', '/calendars', CALENDAR, { headers });
  assert.equal(calendar.status, 201);
  assert.notEqual(calendar.json.id, first.json.id);
});

// ---------------------------------------------------------------- lecture

test('GET : projections par format avec compteurs, autre format → 404', async () => {
  const cal = await call('POST', '/calendars', CALENDAR);
  docs.get(cal.json.id).stats.seeAllClicks = 4;
  const gotCal = await call('GET', `/calendars/${cal.json.id}`);
  assert.equal(gotCal.status, 200);
  assert.deepEqual(projection(gotCal.json), {
    id: cal.json.id, embedUrl: cal.json.embedUrl, title: 'Coupe du monde',
    dates: [
      { text: 'Finale', complement: 'Lusail', start: '2026-12-20T19:45:00.000Z' },
      { text: 'Demie', complement: '', start: '2026-07-01T18:00:00.000Z' },
    ],
    nbElemsToShow: 100,
    linkGlobal: { text: 'Programme', href: 'https://blick.ch', newTab: true },
    views: 0, seeAllClicks: 4, theme: 'Sport', brand: 'blick',
  });

  const tin = await call('POST', '/tinders', TINDER);
  const tinDoc = docs.get(tin.json.id);
  tinDoc.stats.tinderVotes[tinDoc.data.tinderCards[1].id] = { yes: 3, no: 1 };
  const gotTin = await call('GET', `/tinders/${tin.json.id}`);
  assert.deepEqual(gotTin.json.cards.map(({ label, yes, no }) => [label, yes, no]), [['A', 0, 0], ['B', 3, 1], ['C', 0, 0]]);

  const quiz = await call('POST', '/quizzes', QUIZ);
  const quizDoc = docs.get(quiz.json.id);
  const firstId = quizDoc.data.questions[0].id;
  quizDoc.stats.statsQuestions[firstId] = { correct: 5, incorrect: 2 };
  quizDoc.stats.statsGlobal.scoreDistribution = { 0: 1, 1: 4, 2: 2 };
  const gotQuiz = await call('GET', `/quizzes/${quiz.json.id}`);
  assert.equal(gotQuiz.json.plays, 7);
  assert.deepEqual(gotQuiz.json.questions[0].answers[1], { text: '4', isCorrect: true });
  assert.deepEqual([gotQuiz.json.questions[0].correct, gotQuiz.json.questions[0].incorrect], [5, 2]);
  assert.equal(gotQuiz.json.questions[0].img, quizDoc.data.questions[0].img);

  assert.equal((await call('GET', `/quizzes/${cal.json.id}`)).status, 404);
});

test('GET quiz ancien format : statistiques en tableau par position', async () => {
  docs.set('legacy', { type: 'quiz', meta: { id: 'legacy', theme: '', brand: '' }, data: { title: 'Vieux', questions: [{ text: 'Q', answers: [] }] }, stats: { statsQuestions: [{ correct: 2, incorrect: 1 }] } });
  const res = await call('GET', '/quizzes/legacy');
  assert.equal(res.status, 200);
  assert.deepEqual([res.json.questions[0].id, res.json.questions[0].correct, res.json.brand, res.json.plays], [null, 2, 'blick', 0]);
});

// ---------------------------------------------------------------- images (unités réelles)

test('anti-SSRF : adresses privées et URLs non https refusées', async () => {
  for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  for (const bad of ['http://images.ringier.ch/a.jpg', 'https://127.0.0.1/a.jpg', 'https://localhost/a.jpg', 'https://u:p@cdn.test/a.jpg', 'https://cdn.test:8443/a.jpg', 'pas une url']) {
    await assert.rejects(fetchImageSafely(bad), ImageError, bad);
  }
});

test('anti-SSRF : une redirection vers http est refusée (requête réellement envoyée)', async () => {
  // Le faux serveur ne répond qu'une fois la requête terminée (`end()`), comme le vrai.
  const request = (url, options, onResponse) => {
    const req = new EventEmitter();
    return Object.assign(req, {
      end() {
        process.nextTick(() => {
          const res = new PassThrough();
          res.statusCode = 302;
          res.headers = { location: 'http://169.254.169.254/computeMetadata/v1/' };
          onResponse(res);
          res.end();
        });
      },
      destroy() {},
    });
  };
  await assert.rejects(fetchImageSafely('https://cdn.test/a.jpg', { request }), /https/);
});

test('conversion comme le dashboard : WebP ≤ 1928 px et ≤ 75 Ko, y compris une image très détaillée', async () => {
  const noisy = Buffer.alloc(3000 * 2000 * 3);
  for (let i = 0; i < noisy.length; i++) noisy[i] = (i * 7919) % 251;
  const detailed = await sharp(noisy, { raw: { width: 3000, height: 2000, channels: 3 } }).png().toBuffer();
  const simple = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#d40000' } }).jpeg().toBuffer();

  for (const source of [detailed, simple]) {
    const webp = await toDashboardWebp(source);
    const meta = await sharp(webp).metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(Math.max(meta.width, meta.height) <= 1928, `${meta.width}x${meta.height}`);
    assert.ok(webp.length <= IMAGE_TARGET_BYTES, `taille ${webp.length}`);
  }
  const simpleMeta = await sharp(await toDashboardWebp(simple)).metadata();
  assert.deepEqual([simpleMeta.width, simpleMeta.height], [1928, 1285]); // pas de réduction inutile
  await assert.rejects(toDashboardWebp(Buffer.from('<html>pas une image</html>')), ImageError);
});

// ---------------------------------------------------------------- teasers, dossiers, notes, joueur du match, faits (spec 005)

const TEASER = {
  label: 'Votations', title: 'Tout sur\nle 30 novembre', img: 'https://images.ringier.ch/t.jpg',
  button: { text: 'Lire le dossier', href: 'https://www.blick.ch/fr/politique', newTab: true }, theme: 'Suisse',
};
const FOLDER = {
  label: 'Mondial', labelColor: 'sport', name: 'Coupe du monde\n2026', img: 'https://images.ringier.ch/f.jpg',
  buttons: [{ text: 'Programme', href: 'https://www.blick.ch/a' }, { text: 'Groupes', href: 'https://www.blick.ch/b', newTab: true }], theme: 'Sport',
};
const NATINOTES = {
  title: 'Suisse – Kosovo', showRecap: false, theme: 'Sport',
  players: [
    { id: 'granit-xhaka', blickRating: 5, comment: '<p>Le <b>patron</b>.</p><script>alert(1)</script>' },
    { id: 'armando-broja', blickRating: 3, comment: 'Discret' },
  ],
};
const [POTM_TEAM_A, POTM_TEAM_B] = potmTeamsForContext('national');
const POTM = {
  context: 'national', category: 'Dames', text: 'Suisse – Norvège', date: '2026-12-20', theme: 'Sport',
  players: [{ name: 'Alisha Lehmann', position: 'Attaquant', team: POTM_TEAM_A.name }, { name: 'Lia Wälti', position: 'Milieu', team: POTM_TEAM_B.name }],
};
const FACTS = {
  title: 'Ajoie – Lausanne', date: '2026-07-01', theme: 'Sport',
  items: [
    { type: 'normal', icon: 'iconEye', title: 'Le fait', text: '<p>Un <i>record</i>.</p>' },
    { type: 'quote', icon: 'iconQuote', title: 'Il l’a dit', text: 'Nous avons <b>gagné</b>', author: 'Le coach', picture: 'https://images.ringier.ch/q.jpg' },
    { type: 'picture', icon: 'iconFingerUp', title: 'L’image', src: 'https://images.ringier.ch/p.jpg', text: '<p>Le but.</p>', caption: 'Keystone' },
    { type: 'number', icon: 'iconHashtag', title: 'En chiffres', value: 3, text: 'buts en 10 minutes' },
    { type: 'rating', title: 'Quelle note ?' },
  ],
};
const PRONO = { event: PRONO_COMPETITIONS[2].name, date: '2026-06-15', team1: PRONO_TEAMS[0].name, team2: PRONO_TEAMS[1].name, theme: 'Sport' };
const TESTIMONY = {
  title: 'Votre avis nous intéresse', subject: 'Hausse des primes maladie',
  question: 'Comment faites-vous face à la hausse de vos primes ?', timeExpires: '2026-12-20T20:45', theme: 'Suisse',
};
const docFrom = (record, id, author = 'Hub Rédaction') => transformWidgetData({ ...record, id, author, deleted: false }, { serverTimestamp: () => TS });
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Création, rejeu idempotent (200, sans recopier d'image) puis contenu différent (409). */
async function createAndReplay(resource, body, changed) {
  const headers = { 'Idempotency-Key': `${resource}-1` };
  const res = await call('POST', `/${resource}`, body, { headers });
  assert.equal(res.status, 201, JSON.stringify(res.json.errors ?? ''));
  const before = { fetched: fetched.length, stored: stored.length };
  const replay = await call('POST', `/${resource}`, body, { headers });
  assert.deepEqual([replay.status, replay.headers.get('idempotent-replayed'), replay.json], [200, 'true', res.json]);
  assert.deepEqual({ fetched: fetched.length, stored: stored.length }, before, 'aucune image recopiée au rejeu');
  assert.equal((await call('POST', `/${resource}`, changed, { headers })).status, 409);
  return res.json;
}

test('POST /teasers : image copiée sous teasers/, titre en \\n littéral, document du dashboard ; GET ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('teasers', TEASER, { ...TEASER, label: 'Autre' });
  assert.equal(embedUrl, `${BASE}teaser/?teaserDoc=${id}`);
  assert.deepEqual(fetched, [TEASER.img]);
  const img = storageUrl('teasers/1.webp');
  const doc = docs.get(id);
  assert.deepEqual(doc, docFrom(buildTeaserSaveData({ ...TEASER, img }), id));
  assert.equal(doc.data.title, 'Tout sur\\nle 30 novembre');
  assert.deepEqual(doc.stats, { views: 0, clicks: 0 });

  Object.assign(doc.stats, { views: 9, clicks: 4 });
  const got = await call('GET', `/teasers/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, label: 'Votations', title: TEASER.title, img, button: TEASER.button, views: 9, clicks: 4, theme: 'Suisse', brand: 'blick',
  });
});

test('POST /folders : boutons avec ids et clics à 0, image copiée sous folders/ ; GET avec clics par bouton ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('folders', FOLDER, { ...FOLDER, buttons: FOLDER.buttons.slice(0, 1) });
  assert.equal(embedUrl, `${BASE}folder/?folderDoc=${id}`);
  const img = storageUrl('folders/1.webp');
  const doc = docs.get(id);
  const ids = doc.data.buttons.map((button) => button.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(doc, docFrom(buildFolderSaveData({ ...FOLDER, img, buttons: FOLDER.buttons.map((b, i) => ({ ...b, id: ids[i] })) }), id));
  assert.deepEqual([doc.data.folderLabelColor, doc.data.folderName], ['bg-sport', 'Coupe du monde\\n2026']);
  assert.deepEqual(doc.stats, { views: 0, buttonClicks: { [ids[0]]: 0, [ids[1]]: 0 } });

  doc.stats.buttonClicks[ids[1]] = 6;
  const got = await call('GET', `/folders/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, label: 'Mondial', labelColor: 'sport', name: FOLDER.name, img,
    buttons: [
      { id: ids[0], text: 'Programme', href: 'https://www.blick.ch/a', newTab: false, clicks: 0 },
      { id: ids[1], text: 'Groupes', href: 'https://www.blick.ch/b', newTab: true, clicks: 6 },
    ],
    views: 0, theme: 'Sport', brand: 'blick',
  });
});

test('POST /natinotes : joueurs copiés depuis les effectifs, paragraphe nettoyé ; GET avec notes des lecteurs ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('natinotes', NATINOTES, { ...NATINOTES, title: 'Autre' });
  assert.equal(embedUrl, `${BASE}natinotes/?natinotesDoc=${id}`);
  assert.deepEqual(fetched, [], 'aucune image téléchargée');
  const doc = docs.get(id);
  assert.deepEqual(doc, docFrom(buildNatinotesSaveData(NATINOTES, { teams: TEAMS }), id));
  const [xhaka, broja] = doc.data.players;
  assert.deepEqual([xhaka.name, xhaka.team, xhaka.img, xhaka.focal], ['Granit Xhaka', 'Suisse', TEAMS[0].players[1].img, { x: 40, y: 10, zoom: 1.5 }]);
  assert.deepEqual([broja.team, broja.img], ['Albanie', null]);
  assert.ok(!xhaka.comment.includes('<script'), xhaka.comment);
  assert.ok(xhaka.comment.includes('<strong>patron</strong>'), xhaka.comment);
  assert.deepEqual([doc.data.label, doc.data.showRecap, doc.stats], ['', false, { views: 0, playerRatings: {} }]);

  doc.stats.playerRatings = { 'granit-xhaka': { 5: 40, 6: 8 } };
  const got = await call('GET', `/natinotes/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, title: 'Suisse – Kosovo', showRecap: false,
    players: [
      { id: 'granit-xhaka', name: 'Granit Xhaka', team: 'Suisse', img: xhaka.img, blickRating: 5, comment: xhaka.comment, ratings: { 5: 40, 6: 8 } },
      { id: 'armando-broja', name: 'Armando Broja', team: 'Albanie', img: null, blickRating: 3, comment: broja.comment, ratings: {} },
    ],
    views: 0, theme: 'Sport', brand: 'blick',
  });
});

test('POST /natinotes : joueur inconnu, archivé ou en double → 400 sur players[i].id, rien d\'écrit', async () => {
  const players = [
    { id: 'inconnu', blickRating: 4, comment: 'x' },
    { id: 'yann-sommer', blickRating: 4, comment: 'x' },
    { id: 'breel-embolo', blickRating: 4, comment: 'x' },
    { id: 'breel-embolo', blickRating: 4, comment: 'x' },
  ];
  const res = await call('POST', '/natinotes', { ...NATINOTES, players });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['players[0].id', 'invalid_value'], ['players[1].id', 'invalid_value'], ['players[3].id', 'duplicate']]);
  assert.equal(docs.size, 0);
});

test('POST /potms : date à midi heure suisse, postes accordés (Dames), équipes du contexte ; GET avec votes ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('potms', POTM, { ...POTM, date: '2026-12-21' });
  assert.equal(embedUrl, `${BASE}potm/?potmDoc=${id}`);
  const doc = docs.get(id);
  const ids = doc.data.players.map((player) => player.id);
  const expected = docFrom(buildPotmSaveData({ ...POTM, date: parseDate(POTM.date), players: POTM.players.map((p, i) => ({ ...p, id: ids[i] })) }, { toTimestamp: fakeTimestamp }), id);
  assert.deepEqual(plain(doc), plain(expected));
  assert.equal(doc.data.context.date.toDate().toISOString(), '2026-12-20T11:00:00.000Z'); // midi en hiver = UTC+1
  assert.deepEqual(doc.data.players.map((p) => [p.position, p.team, p.code, p.color]), [
    ['Attaquante', POTM_TEAM_A.name, POTM_TEAM_A.code, POTM_TEAM_A.color],
    ['Milieu', POTM_TEAM_B.name, POTM_TEAM_B.code, POTM_TEAM_B.color],
  ]);
  assert.deepEqual(doc.stats, { views: 0, playersVotes: { [ids[0]]: 0, [ids[1]]: 0 } });

  doc.stats.playersVotes[ids[0]] = 12;
  const got = await call('GET', `/potms/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, context: 'national', category: 'Dames', text: 'Suisse – Norvège', date: '2026-12-20',
    players: [
      { id: ids[0], name: 'Alisha Lehmann', position: 'Attaquante', team: POTM_TEAM_A.name, votes: 12 },
      { id: ids[1], name: 'Lia Wälti', position: 'Milieu', team: POTM_TEAM_B.name, votes: 0 },
    ],
    views: 0, theme: 'Sport', brand: 'blick',
  });
});

test('POST /potms : date illisible, équipe d\'un autre contexte → 400 sur leur chemin', async () => {
  const [hockey] = potmTeamsForContext('national_league');
  const res = await call('POST', '/potms', { ...POTM, date: '2026-02-30', players: [POTM.players[0], { ...POTM.players[1], team: hockey.name }] });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['date', 'invalid_value'], ['players[1].team', 'invalid_value']]);
  assert.equal(docs.size, 0);
});

test('POST /facts : items par type, images copiées sous factss/, date à midi ; GET avec reveal et ratingStats ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('facts', FACTS, { ...FACTS, items: FACTS.items.slice(0, 4) });
  assert.equal(embedUrl, `${BASE}facts/?factsDoc=${id}`);
  assert.deepEqual(fetched, ['https://images.ringier.ch/q.jpg', 'https://images.ringier.ch/p.jpg'], 'ordre du formulaire');
  const doc = docs.get(id);
  const ids = doc.data.items.map((item) => item.id);
  assert.equal(new Set(ids).size, 5);
  const copies = { 1: { picture: storageUrl('factss/1.webp') }, 2: { src: storageUrl('factss/2.webp') } };
  const expected = docFrom(buildFactsSaveData({
    ...FACTS, date: parseDate(FACTS.date), items: FACTS.items.map((item, i) => ({ ...item, ...copies[i], id: ids[i] })),
  }, { toTimestamp: fakeTimestamp }), id);
  assert.deepEqual(plain(doc), plain(expected));
  assert.equal(doc.data.date.toDate().toISOString(), '2026-07-01T10:00:00.000Z'); // midi en été = UTC+2
  assert.deepEqual([doc.data.items[1].picture, doc.data.items[2].src], [copies[1].picture, copies[2].src]);
  assert.ok(!JSON.stringify(doc).includes('images.ringier.ch'));
  assert.deepEqual(doc.stats, { views: 0, reveal: 0, ratingStats: {} });

  Object.assign(doc.stats, { reveal: 3, ratingStats: { 8: 2, 10: 1 } });
  const got = await call('GET', `/facts/${id}`);
  assert.deepEqual([got.json.title, got.json.date, got.json.reveal, got.json.ratingStats, got.json.views], ['Ajoie – Lausanne', '2026-07-01', 3, { 8: 2, 10: 1 }, 0]);
  assert.deepEqual(got.json.items.map(({ id: itemId, type, title }) => [itemId, type, title]), FACTS.items.map((item, i) => [ids[i], item.type, item.title]));
  assert.deepEqual([got.json.items[1].picture, got.json.items[2].src, got.json.items[2].caption, got.json.items[3].value], [copies[1].picture, copies[2].src, 'Keystone', 3]);
});

test('POST /facts : champ d\'un autre type, deuxième item « rating » → 400 sur leur chemin', async () => {
  const res = await call('POST', '/facts', {
    ...FACTS,
    items: [{ ...FACTS.items[0], src: 'https://images.ringier.ch/x.jpg' }, FACTS.items[4], FACTS.items[4]],
  });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['items[0].src', 'unknown_field'], ['items[2].type', 'too_many']]);
  assert.deepEqual([docs.size, fetched], [0, []]);
});

test('POST /pronos : équipes complétées par teams.json, un vote par issue, date à midi heure suisse ; GET avec votes ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('pronos', PRONO, { ...PRONO, team2: PRONO_TEAMS[2].name });
  assert.equal(embedUrl, `${BASE}prono/?pronoDoc=${id}`);
  const doc = docs.get(id);
  const expected = docFrom(buildPronoSaveData({ ...PRONO, date: parseDate(PRONO.date) }, { toTimestamp: fakeTimestamp }), id);
  assert.deepEqual(plain(doc), plain(expected));
  assert.equal(doc.data.pronoData.date.toDate().toISOString(), '2026-06-15T10:00:00.000Z'); // midi en été = UTC+2
  assert.deepEqual(plain(doc.data.pronoData.item1), { name: PRONO_TEAMS[0].name, code: PRONO_TEAMS[0].code, type: 'national', color: PRONO_TEAMS[0].color });
  assert.deepEqual(doc.stats, { views: 0, itemVotes: { item1: 1, item2: 1, item3: 1 } });
  assert.equal(doc.meta.title, `${PRONO.team1} - ${PRONO.team2}`);

  doc.stats.itemVotes.item2 = 7;
  const got = await call('GET', `/pronos/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, event: PRONO.event, date: '2026-06-15', team1: PRONO.team1, team2: PRONO.team2,
    votes: { team1: 1, team2: 7, draw: 1 }, views: 0, theme: 'Sport', brand: 'blick',
  });
});

test('POST /pronos : compétition ou équipe hors liste, date illisible, couleur (réservée au dashboard) → 400', async () => {
  const [club] = potmTeamsForContext('national_league');
  const res = await call('POST', '/pronos', { ...PRONO, event: 'Ligue des champions', date: '2026-02-30', team1: club.name, color1: '#ff0000' });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['color1', 'unknown_field'], ['event', 'invalid_value'], ['date', 'invalid_value'], ['team1', 'invalid_value']]);
  assert.equal(docs.size, 0);
});

test('POST /testimonies : textes rognés, date limite en heure suisse, compteurs à 0 ; GET sans les messages ; rejeu', async () => {
  const { id, embedUrl } = await createAndReplay('testimonies', { ...TESTIMONY, subject: ` ${TESTIMONY.subject} ` }, { ...TESTIMONY, timeExpires: '2026-12-21T20:45' });
  assert.equal(embedUrl, `${BASE}testimony/?testimonyDoc=${id}`);
  const doc = docs.get(id);
  const expected = docFrom(buildTestimonySaveData({ ...TESTIMONY, timeExpires: parseDateTime(TESTIMONY.timeExpires) }, { toTimestamp: fakeTimestamp }), id);
  assert.deepEqual(plain(doc), plain(expected));
  assert.equal(doc.data.timeExpires.toDate().toISOString(), '2026-12-20T19:45:00.000Z');
  assert.deepEqual(doc.stats, { views: 0, msgSent: 0 });
  assert.equal(doc.meta.title, TESTIMONY.subject);

  doc.stats.msgSent = 3;
  doc.messages = [{ name: 'Lecteur', email: 'lecteur@example.ch', message: 'Mon témoignage' }];
  const got = await call('GET', `/testimonies/${id}`);
  assert.deepEqual(projection(got.json), {
    id, embedUrl, title: TESTIMONY.title, subject: TESTIMONY.subject, question: TESTIMONY.question,
    timeExpires: '2026-12-20T19:45:00.000Z', views: 0, msgSent: 3, theme: 'Suisse', brand: 'blick',
  });

  const open = await call('POST', '/testimonies', { ...TESTIMONY, timeExpires: undefined });
  assert.equal(open.status, 201);
  assert.equal(docs.get(open.json.id).data.timeExpires, null);
  assert.equal((await call('GET', `/testimonies/${open.json.id}`)).json.timeExpires, null);
});

test('POST /testimonies : textes manquants, date limite illisible, champ inconnu → 400', async () => {
  const res = await call('POST', '/testimonies', { theme: 'Suisse', title: ' ', question: 'Q ?', timeExpires: '2026-12-20', messages: [] });
  assert.equal(res.status, 400);
  assert.deepEqual(fields(res), [['messages', 'unknown_field'], ['title', 'required'], ['subject', 'required'], ['timeExpires', 'invalid_value']]);
  assert.equal(docs.size, 0);
});

test('images des nouveaux formats : illisible → 400 sur son chemin, copies supprimées ; envoi POST /images copié sous le préfixe', async () => {
  const teaser = await call('POST', '/teasers', { ...TEASER, img: 'https://cdn.example/broken.jpg' });
  assert.deepEqual(fields(teaser), [['img', 'invalid_value']]);
  assert.match(teaser.json.errors[0].message, /^Image du teaser : /);

  const facts = await call('POST', '/facts', { ...FACTS, items: [FACTS.items[1], FACTS.items[0], { ...FACTS.items[2], src: 'https://cdn.example/notimage.jpg' }] });
  assert.deepEqual(fields(facts), [['items[2].src', 'invalid_value']]);
  assert.match(facts.json.errors[0].message, /^Fait marquant 3 : /);
  assert.deepEqual([stored, removed, docs.size], [['factss/1.webp'], ['factss/1.webp'], 0]);

  const sent = await upload(await photo(), 'image/jpeg');
  const folder = await call('POST', '/folders', { ...FOLDER, img: sent.json.url });
  assert.equal(folder.status, 201);
  assert.equal(docs.get(folder.json.id).data.img, storageUrl('folders/3.webp'), 'copie sous folders/, indépendante de l\'envoi');

  failNextCreate = true;
  removed = [];
  assert.equal((await call('POST', '/teasers', TEASER)).status, 500);
  assert.deepEqual(removed, ['teasers/4.webp']);
});

test('GET /teams : effectifs triés par nom, joueurs archivés exclus ; 401 / 403 / 405', async () => {
  const res = await call('GET', '/teams');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, plain({ teams: listTeamsForPicker(TEAMS) }));
  assert.deepEqual(res.json.teams.map((team) => [team.name, team.players.map((player) => player.id)]), [
    ['Albanie', ['armando-broja']],
    ['Suisse M – Football', ['breel-embolo', 'granit-xhaka']],
  ]);
  assert.deepEqual(res.json.teams[1].players[0], { id: 'breel-embolo', name: 'Breel Embolo', team: 'Suisse M – Football', img: null, focal: res.json.teams[1].players[0].focal });
  assert.equal((await call('GET', '/teams', undefined, { token: null })).status, 401);
  assert.equal((await call('GET', '/teams', undefined, { token: 'stranger' })).status, 403);
  const post = await call('POST', '/teams', {});
  assert.deepEqual([post.status, post.headers.get('allow')], [405, 'GET']);
});

test('routage : une ressource par format décrit (hors sondage), autre format ou chemin → 404, autre méthode → 405', async () => {
  for (const form of WIDGET_FORMS.filter(({ type }) => type !== 'poll')) {
    const missing = await call('GET', `/${form.resource}/inconnu`);
    assert.deepEqual([missing.status, missing.json.code], [404, 'NOT_FOUND'], form.resource);
    const put = await call('PUT', `/${form.resource}`, {});
    assert.deepEqual([put.status, put.headers.get('allow')], [405, 'POST'], form.resource);
    const del = await call('DELETE', `/${form.resource}/x`);
    assert.deepEqual([del.status, del.headers.get('allow')], [405, 'GET, PUT'], form.resource);
    assert.equal((await call('POST', `/${form.resource}`, {}, { token: null })).status, 401, form.resource);
  }
  const teaser = await call('POST', '/teasers', TEASER);
  assert.equal((await call('GET', `/folders/${teaser.json.id}`)).status, 404, 'id d\'un autre format');
  for (const path of ['/testimony', '/prono', '/teasers/a/b', '/teams/x', '/constructor', '/__proto__', '/hasOwnProperty/x']) {
    assert.equal((await call('POST', path, {})).status, 404, path);
  }
});

// ---------------------------------------------------------------- modification (PUT, spec 006)

const V0 = '2026-11-01T10:00:00.000Z';
const EDITOR = 'jane.doe@ringier.ch';

/** Création par l'API, horodatage relu comme Firestore, compteurs posés ; renvoie id + document. */
async function created(resource, body, stats = {}) {
  const res = await call('POST', `/${resource}`, body);
  assert.equal(res.status, 201, JSON.stringify(res.json.errors ?? ''));
  const doc = docs.get(res.json.id);
  doc.meta.timeCreated = fakeTimestamp(new Date('2026-10-01T08:00:00Z'));
  doc.meta.timeUpdated = fakeTimestamp(new Date(V0));
  Object.assign(doc.stats, stats);
  return { id: res.json.id, doc };
}

/** GET → `form` + `version`, puis PUT du formulaire modifié par `change`. */
async function editVia(resource, id, change = (form) => form, extra = { editor: EDITOR }) {
  const got = await call('GET', `/${resource}/${id}`);
  assert.equal(got.status, 200);
  const res = await call('PUT', `/${resource}/${id}`, { ...change(structuredClone(got.json.form)), version: got.json.version, ...extra });
  return { got, res, doc: docs.get(id) };
}

/** Méta d'un document modifié : id, auteur et création gardés ; version = nouveau `timeUpdated`. */
function assertEdited(res, doc, { id, author = 'Hub Rédaction', editor = EDITOR }) {
  assert.equal(res.status, 200, JSON.stringify(res.json.errors ?? res.json));
  assert.deepEqual(Object.keys(res.json), ['id', 'embedUrl', 'version']);
  assert.equal(res.json.id, id);
  assert.notEqual(res.json.version, V0);
  assert.equal(doc.meta.timeUpdated.toDate().toISOString(), res.json.version);
  assert.deepEqual(
    [doc.meta.id, doc.meta.author, doc.meta.deleted, doc.meta.timeCreated.toDate().toISOString(), doc.meta.lastEditor],
    [id, author, false, '2026-10-01T08:00:00.000Z', editor],
  );
}

test('PUT /polls/{id} : réponses par id, votes gardés, nouvelle à 0, retirée sans votes ; PATCH inchangé', async () => {
  const res = await call('POST', '/polls', { question: 'Q ?', answers: ['Oui', 'Non', 'Bof'], theme: 'Suisse', brand: 'pme' });
  const id = res.json.id;
  const doc = docs.get(id);
  const [a, b] = doc.data.answerTxts.map((answer) => answer.id);
  Object.assign(doc.meta, { timeCreated: fakeTimestamp(new Date('2026-10-01T08:00:00Z')), timeUpdated: fakeTimestamp(new Date(V0)) });
  doc.stats.answerCounters = { ...doc.stats.answerCounters, [a]: 3, [b]: 5 };
  doc.stats.views = 40;

  const got = await call('GET', `/polls/${id}`);
  assert.deepEqual([got.json.form, got.json.version], [{ question: 'Q ?', answers: [{ id: a, text: 'Oui' }, { id: b, text: 'Non' }, { id: doc.data.answerTxts[2].id, text: 'Bof' }], theme: 'Suisse', brand: 'pme' }, V0]);
  const put = await call('PUT', `/polls/${id}`, {
    ...got.json.form, question: ' Nouvelle ? ', answers: [{ id: b, text: 'Non !' }, 'Peut-être', { id: a, text: 'Oui' }], version: V0, editor: EDITOR,
  });
  const after = docs.get(id);
  assertEdited(put, after, { id });
  assert.equal(put.json.embedUrl, `${BASE}poll/?pollDoc=${id}&brand=pme`);
  const added = after.data.answerTxts[1].id;
  assert.deepEqual(after.data.answerTxts, [{ id: b, text: 'Non !' }, { id: added, text: 'Peut-être' }, { id: a, text: 'Oui' }]);
  assert.deepEqual(after.stats, { views: 40, answerCounters: { [b]: 5, [added]: 0, [a]: 3 } });
  assert.deepEqual([after.data.question, after.meta.title, after.meta.brand], ['Nouvelle ?', 'Nouvelle ?', 'pme']);
  assert.equal((await call('GET', `/polls/${id}`)).json.version, put.json.version);
  const patched = await call('PATCH', `/polls/${id}`, { editor: EDITOR, question: 'Encore ?' });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.form, undefined, 'réponse du PATCH inchangée');
});

test('PUT /calendars, /teasers, /testimonies : compteurs globaux gardés, lien global retiré avec son compteur', async () => {
  const cal = await created('calendars', CALENDAR, { views: 7, seeAllClicks: 4, globalLinkClicks: 2 });
  const { res, doc } = await editVia('calendars', cal.id, ({ linkGlobal, ...form }) => ({ ...form, title: 'Autre', nbElemsToShow: 1 }));
  assertEdited(res, doc, { id: cal.id });
  assert.deepEqual([doc.data.title, doc.data.nbElemsToShow, doc.data.linkGlobalHref, doc.meta.title], ['Autre', 1, '', 'Autre']);
  assert.deepEqual(doc.stats, { views: 7, seeAllClicks: 4 });
  assert.equal(doc.data.dates[0].scheduleStart.toDate().toISOString(), '2026-12-20T19:45:00.000Z', 'date relue en heure suisse puis réécrite à l\'identique');

  const teaser = await created('teasers', TEASER, { views: 9, clicks: 4 });
  const edited = await editVia('teasers', teaser.id, (form) => ({ ...form, title: 'Deux\nlignes' }));
  assertEdited(edited.res, edited.doc, { id: teaser.id });
  assert.deepEqual([edited.doc.data.title, edited.doc.stats], ['Deux\\nlignes', { views: 9, clicks: 4 }]);

  const testimony = await created('testimonies', TESTIMONY, { views: 5, msgSent: 2 });
  const open = await editVia('testimonies', testimony.id, ({ timeExpires, ...form }) => form);
  assertEdited(open.res, open.doc, { id: testimony.id });
  assert.deepEqual([open.doc.data.timeExpires, open.doc.stats], [null, { views: 5, msgSent: 2 }]);
});

test('PUT /tinders : votes par id de carte, réordonnées ; nouvelle carte à 0 ; carte retirée sans votes', async () => {
  const { id, doc } = await created('tinders', TINDER);
  const [c1, c2, c3] = doc.data.tinderCards.map((card) => card.id);
  doc.stats.tinderVotes = { [c1]: { yes: 1, no: 2 }, [c2]: { yes: 3, no: 4 }, [c3]: { yes: 5, no: 6 } };
  const { got, res, doc: after } = await editVia('tinders', id, (form) => ({ ...form, cards: [form.cards[2], { label: 'N', title: 'Neuve' }, form.cards[0]], legend: 'Glisse' }));
  assert.deepEqual(got.json.form.cards.map((card) => card.id), [c1, c2, c3]);
  assertEdited(res, after, { id });
  const added = after.data.tinderCards[1].id;
  assert.deepEqual(after.stats.tinderVotes, { [c3]: { yes: 5, no: 6 }, [added]: { yes: 0, no: 0 }, [c1]: { yes: 1, no: 2 } });
  assert.deepEqual(after.data.tinderLegend, { txt: 'Glisse', display: true });
});

test('PUT /quizzes : statistiques par id de question, distribution ramenée à 0..n, image inchangée gardée sans téléchargement', async () => {
  const { id, doc } = await created('quizzes', QUIZ);
  const [q1, q2] = doc.data.questions.map((question) => question.id);
  Object.assign(doc.stats, { statsQuestions: { [q1]: { correct: 5, incorrect: 1 }, [q2]: { correct: 2, incorrect: 4 } }, statsGlobal: { scoreDistribution: { 0: 1, 1: 3, 2: 2 } } });
  const before = { fetched: fetched.length, stored: stored.length };
  const { res, doc: after } = await editVia('quizzes', id, (form) => ({ ...form, questions: [form.questions[0]] }));
  assertEdited(res, after, { id, author: 'jane@ringier.ch' });
  assert.deepEqual({ fetched: fetched.length, stored: stored.length }, before);
  assert.equal(after.data.questions[0].img, doc.data.questions[0].img);
  assert.deepEqual(after.stats.statsQuestions, { [q1]: { correct: 5, incorrect: 1 } });
  assert.deepEqual(after.stats.statsGlobal, { scoreDistribution: { 0: 1, 1: 3 } });
});

test('PUT : nouvelle image importée sous le préfixe du format, ancienne copie gardée dans le Storage', async () => {
  const teaser = await created('teasers', TEASER);
  const oldImg = teaser.doc.data.img;
  const { res, doc } = await editVia('teasers', teaser.id, (form) => ({ ...form, img: 'https://images.ringier.ch/new.jpg' }));
  assertEdited(res, doc, { id: teaser.id });
  assert.deepEqual(fetched, [TEASER.img, 'https://images.ringier.ch/new.jpg']);
  assert.equal(doc.data.img, storageUrl('teasers/2.webp'));
  assert.deepEqual(removed, []);
  assert.ok(objects.has('teasers/1.webp'), `${oldImg} non supprimée`);

  const sent = await upload(await photo(), 'image/jpeg');
  const facts = await created('facts', FACTS, { reveal: 3, ratingStats: { 8: 2 } });
  const edited = await editVia('facts', facts.id, (form) => ({ ...form, items: form.items.map((item) => (item.type === 'picture' ? { ...item, src: sent.json.url } : item)) }));
  assertEdited(edited.res, edited.doc, { id: facts.id });
  assert.equal(edited.doc.data.items[1].picture, facts.doc.data.items[1].picture, 'image inchangée gardée');
  assert.equal(edited.doc.data.items[2].src, storageUrl('factss/6.webp'), 'envoi copié sous factss/');
  assert.deepEqual(edited.doc.data.items.map((item) => item.id), facts.doc.data.items.map((item) => item.id));
  assert.deepEqual(edited.doc.stats, { views: 0, reveal: 3, ratingStats: { 8: 2 } });

  const broken = await editVia('teasers', teaser.id, (form) => ({ ...form, img: 'https://cdn.example/broken.jpg' }));
  assert.deepEqual(fields(broken.res), [['img', 'invalid_value']]);
});

test('PUT /folders, /potms, /pronos : compteurs par id (ou par issue), élément retiré sans compteur', async () => {
  const folder = await created('folders', FOLDER);
  const [b1, b2] = folder.doc.data.buttons.map((button) => button.id);
  folder.doc.stats.buttonClicks = { [b1]: 10, [b2]: 20 };
  const f = await editVia('folders', folder.id, (form) => ({ ...form, labelColor: 'brand', buttons: [form.buttons[1], { text: 'Neuf', href: 'https://x.ch' }] }));
  assertEdited(f.res, f.doc, { id: folder.id });
  assert.deepEqual(f.doc.stats.buttonClicks, { [b2]: 20, [f.doc.data.buttons[1].id]: 0 });
  assert.equal(f.doc.data.folderLabelColor, 'bg-brand');
  assert.equal(f.doc.data.img, folder.doc.data.img);

  const potm = await created('potms', POTM);
  const [p1, p2] = potm.doc.data.players.map((player) => player.id);
  potm.doc.stats.playersVotes = { [p1]: 12, [p2]: 3 };
  const p = await editVia('potms', potm.id, (form) => {
    assert.deepEqual(form.players.map(({ position }) => position), ['Attaquant', 'Milieu'], 'poste neutre relu');
    return { ...form, category: 'Messieurs', players: [form.players[1], form.players[0]] };
  });
  assertEdited(p.res, p.doc, { id: potm.id });
  assert.deepEqual(p.doc.stats.playersVotes, { [p2]: 3, [p1]: 12 });
  assert.deepEqual(p.doc.data.players.map(({ position }) => position), ['Milieu', 'Attaquant']);

  const prono = await created('pronos', PRONO, { itemVotes: { item1: 10, item2: 20, item3: 5 } });
  prono.doc.data.pronoData.item1.color = '#123456';
  const r = await editVia('pronos', prono.id, (form) => ({ ...form, team2: PRONO_TEAMS[2].name }));
  assertEdited(r.res, r.doc, { id: prono.id });
  assert.deepEqual(r.doc.stats.itemVotes, { item1: 10, item2: 20, item3: 5 });
  assert.deepEqual([r.doc.data.pronoData.item1.color, r.doc.data.pronoData.item2.name], ['#123456', PRONO_TEAMS[2].name]);
});

test('PUT /natinotes : joueur déjà enregistré accepté même archivé, notes gardées par joueur, label conservé', async () => {
  const { id, doc } = await created('natinotes', NATINOTES);
  doc.data.label = 'Ancien';
  doc.data.players.push({ id: 'yann-sommer', name: 'Yann Sommer', team: 'Suisse', img: null, focal: { x: 50, y: 0, zoom: 1 }, blickRating: 6, comment: 'Mur' });
  doc.stats.playerRatings = { 'granit-xhaka': { 5: 4 }, 'armando-broja': { 2: 1 }, 'yann-sommer': { 6: 9 } };
  const { got, res, doc: after } = await editVia('natinotes', id, (form) => ({ ...form, players: form.players.filter((player) => player.id !== 'armando-broja') }));
  assert.deepEqual(got.json.form.players.map((player) => player.id), ['granit-xhaka', 'armando-broja', 'yann-sommer']);
  assertEdited(res, after, { id });
  assert.deepEqual(after.stats.playerRatings, { 'granit-xhaka': { 5: 4 }, 'yann-sommer': { 6: 9 } });
  assert.equal(after.data.label, 'Ancien');
  const archived = await call('PUT', `/natinotes/${id}`, { ...got.json.form, players: [{ id: 'yann-sommer', blickRating: 6, comment: 'x' }], version: got.json.version });
  assert.equal(archived.status, 409, 'version déjà consommée');
});

test('PUT : 409 VERSION_CONFLICT sur version périmée ou écriture concurrente, images copiées supprimées', async () => {
  const { id } = await created('teasers', TEASER);
  const first = await editVia('teasers', id, (form) => ({ ...form, label: 'Un' }));
  assert.equal(first.res.status, 200);
  const stale = await call('PUT', `/teasers/${id}`, { ...first.got.json.form, label: 'Deux', version: V0 });
  assert.deepEqual([stale.status, stale.json.code], [409, 'VERSION_CONFLICT']);
  assert.equal(docs.get(id).data.label, 'Un');

  const version = first.res.json.version;
  beforeUpdate = () => { docs.get(id).meta.timeUpdated = fakeTimestamp(new Date('2026-12-01T00:00:00Z')); };
  const raced = await call('PUT', `/teasers/${id}`, { ...first.got.json.form, img: 'https://images.ringier.ch/new.jpg', version });
  assert.deepEqual([raced.status, raced.json.code], [409, 'VERSION_CONFLICT']);
  assert.deepEqual(removed, ['teasers/2.webp'], 'copie de la nouvelle image supprimée');
});

test('PUT : 404 absent, supprimé ou autre format ; 400 groupé ; unknown_field ; 405 / 415', async () => {
  const { id, doc } = await created('tinders', TINDER);
  const form = (await call('GET', `/tinders/${id}`)).json.form;
  const body = { ...form, version: V0 };
  assert.equal((await call('PUT', '/tinders/inconnu', body)).status, 404);
  assert.equal((await call('PUT', `/quizzes/${id}`, body)).status, 404);
  assert.equal((await call('PUT', `/polls/${id}`, body)).status, 404);

  const bad = await call('PUT', `/tinders/${id}`, {
    ...form, title: ' ', author: 'x@ringier.ch', cards: [{ ...form.cards[0], id: 42, extra: 1 }, form.cards[1]], editor: 'pas un e-mail', version: undefined,
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(fields(bad), [
    ['author', 'unknown_field'], ['cards[0].extra', 'unknown_field'], ['cards[0].id', 'invalid_type'],
    ['title', 'required'], ['cards', 'too_few'], ['version', 'required'], ['editor', 'invalid_value'],
  ]);
  const quiz = await created('quizzes', QUIZ);
  const quizForm = (await call('GET', `/quizzes/${quiz.id}`)).json.form;
  quizForm.questions[0].answers[0].id = 'a1';
  assert.deepEqual(fields(await call('PUT', `/quizzes/${quiz.id}`, { ...quizForm, version: V0 })), [['questions[0].answers[0].id', 'unknown_field']]);
  assert.deepEqual(fields(await call('PUT', `/quizzes/${quiz.id}`, [])), [['body', 'invalid_type']]);

  doc.meta.deleted = true;
  assert.equal((await call('PUT', `/tinders/${id}`, body)).status, 404);
  const text = await fetch(`${url}/tinders/${id}`, { method: 'PUT', headers: { Authorization: 'Bearer hub', 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(text.status, 415);
  assert.equal((await call('PUT', `/tinders/${id}`, body, { token: 'stranger' })).status, 403);
  const del = await call('DELETE', '/polls/x');
  assert.deepEqual([del.status, del.headers.get('allow')], [405, 'GET, PATCH, PUT']);
});

// ---------------------------------------------------------------- description des formulaires (spec 004)

const VALUES = {
  text: 'Texte', textarea: 'Texte', url: 'https://www.blick.ch', datetime: '2026-12-20T20:45', date: '2026-12-20',
  richtext: '<p>Texte</p>', checkbox: true, image: 'https://images.ringier.ch/a.jpg',
};
const PICKER_PLAYERS = listTeamsForPicker(TEAMS).flatMap((team) => team.players);

/** Valeur d'un champ simple ; `root` : requête en cours (options qui dépendent d'un champ racine). */
function valueFor(field, root) {
  if (field.kind === 'choice') {
    if (field.source === 'teams') return PICKER_PLAYERS[0].id;
    const options = field.dependsOn ? field.optionsBy[root[field.dependsOn] ?? Object.keys(field.optionsBy)[0]] : field.options;
    return options[0].value;
  }
  if (field.kind === 'number') return field.min ?? 1;
  if (field.kind === 'richtext') return field.inline ? 'Texte' : VALUES.richtext;
  return VALUES[field.kind];
}

/** Champs d'un élément de liste : communs, puis ceux de la variante. */
const itemFields = (field, option) => [...(field.fields ?? []), ...(option?.fields ?? [])];

/**
 * Requête construite à partir de la description seule : champs obligatoires (`all` : tous les
 * champs), listes au nombre minimal d'éléments, bonne réponse sur le premier élément. Listes à
 * variantes : la première variante (`all` : un élément par variante).
 */
function sampleFrom(fields, { all = false, root } = {}) {
  const out = {};
  const top = root ?? out;
  for (const field of fields) {
    if (field.kind === 'list' && field.variants) {
      const options = all ? [...field.variants.options] : [];
      while (options.length < Math.max(field.min, 1)) options.push(field.variants.options[0]);
      out[field.key] = options.map((option) => ({ [field.variants.key]: option.value, ...sampleFrom(itemFields(field, option), { all, root: top }) }));
    } else if (field.kind === 'list') {
      const item = () => (field.item ? VALUES[field.item.kind] : sampleFrom(field.fields, { all, root: top }));
      out[field.key] = Array.from({ length: Math.max(field.min, 1) }, item);
      if (field.correct) out[field.key][0][field.correct] = true;
    } else if (field.required || all) {
      if (field.kind === 'group') out[field.key] = sampleFrom(field.fields, { all, root: top });
      else out[field.key] = valueFor(field, top);
    }
  }
  return out;
}

/** Chemins des champs obligatoires (dans le premier élément des listes, de la première variante). */
function requiredPaths(fields, at = '') {
  const paths = [];
  for (const field of fields) {
    const path = `${at}${field.key}`;
    if (field.kind === 'list') {
      paths.push(path);
      if (field.variants) paths.push(`${path}[0].${field.variants.key}`);
      const first = field.variants ? itemFields(field, field.variants.options[0]) : field.fields;
      if (first) paths.push(...requiredPaths(first, `${path}[0].`));
    } else if (field.required) {
      paths.push(path);
      if (field.kind === 'group') paths.push(...requiredPaths(field.fields, `${path}.`));
    }
  }
  return paths;
}

/** Champs `number` bornés présents dans l'exemple minimal : [chemin, champ]. */
function boundedNumbers(fields, at = '') {
  return fields.flatMap((field) => {
    const path = `${at}${field.key}`;
    if (field.kind === 'number' && field.required && (field.min !== undefined || field.max !== undefined)) return [[path, field]];
    if (field.kind === 'group' && field.required) return boundedNumbers(field.fields, `${path}.`);
    if (field.kind === 'list' && !field.item) return boundedNumbers(itemFields(field, field.variants?.options[0]), `${path}[0].`);
    return [];
  });
}

/** Retire (ou remplace) la valeur au chemin `a.b[0].c` d'une copie de la requête. */
function withPath(request, path, value) {
  const copy = structuredClone(request);
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  const parent = keys.slice(0, -1).reduce((node, key) => node[key], copy);
  if (value === undefined) delete parent[keys.at(-1)];
  else parent[keys.at(-1)] = value;
  return copy;
}

test('GET /widget-types : la description des 11 formats, telle que dans le modèle partagé', async () => {
  const res = await call('GET', '/widget-types');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.formats.map((f) => [f.type, f.resource]), [
    ['poll', 'polls'], ['calendar', 'calendars'], ['tinder', 'tinders'], ['quiz', 'quizzes'],
    ['teaser', 'teasers'], ['folder', 'folders'], ['natinotes', 'natinotes'], ['potm', 'potms'], ['facts', 'facts'],
    ['prono', 'pronos'], ['testimony', 'testimonies'],
  ]);
  assert.deepEqual(res.json.formats, JSON.parse(JSON.stringify(WIDGET_FORMS)));
  assert.equal((await call('GET', '/widget-types', undefined, { token: null })).status, 401);
  assert.equal((await call('GET', '/widget-types', undefined, { token: 'stranger' })).status, 403);
  const post = await call('POST', '/widget-types', {});
  assert.deepEqual([post.status, post.headers.get('allow')], [405, 'GET']);
});

for (const form of WIDGET_FORMS) {
  test(`description du ${form.noun} conforme aux règles de l'API : exemple accepté, chaque champ obligatoire et chaque borne vérifiés`, async () => {
    const minimal = sampleFrom(form.fields);
    assert.equal((await call('POST', `/${form.resource}`, minimal)).status, 201, 'champs obligatoires seuls');
    const complete = sampleFrom(form.fields, { all: true });
    const accepted = await call('POST', `/${form.resource}`, complete);
    assert.equal(accepted.status, 201, `tous les champs décrits sont acceptés : ${JSON.stringify(accepted.json.errors ?? '')}`);

    // Le formulaire relu (`GET … form`) se renvoie tel quel par `PUT` : contenu et compteurs inchangés.
    const before = plain(docs.get(accepted.json.id));
    const got = await call('GET', `/${form.resource}/${accepted.json.id}`);
    const fetchedBefore = fetched.length;
    const put = await call('PUT', `/${form.resource}/${accepted.json.id}`, { ...got.json.form, version: got.json.version });
    assert.equal(put.status, 200, `formulaire relu accepté : ${JSON.stringify(put.json.errors ?? put.json)}`);
    const after = docs.get(accepted.json.id);
    assert.deepEqual([plain(after.data), plain(after.stats), after.meta.title, after.meta.lastEditor], [before.data, before.stats, before.meta.title, 'Hub Rédaction']);
    assert.equal(fetched.length, fetchedBefore, 'aucune image retéléchargée');

    for (const path of requiredPaths(form.fields)) {
      const res = await call('POST', `/${form.resource}`, withPath(minimal, path));
      assert.equal(res.status, 400, `${path} absent`);
      assert.ok(res.json.errors.some((e) => e.field === path || e.field.startsWith(`${path}.`) || e.field.startsWith(`${path}[`)), `${path} absent → erreur sur ce champ : ${JSON.stringify(fields(res))}`);
    }

    const lists = [];
    const collect = (fieldsList, at) => fieldsList.forEach((field) => {
      if (field.kind !== 'list') return;
      lists.push([`${at}${field.key}`, field]);
      if (field.fields) collect(field.fields, `${at}${field.key}[0].`);
    });
    collect(form.fields, '');
    for (const [path, field] of lists) {
      // Liste de n éléments, copies du premier de l'exemple (bonne réponse sur le premier seulement).
      const first = path.split(/[.[\]]+/).filter(Boolean).reduce((node, key) => node[key], minimal)[0];
      const other = field.correct ? { ...first, [field.correct]: undefined } : first;
      const sized = (n) => withPath(minimal, path, Array.from({ length: n }, (_, i) => structuredClone(i === 0 ? first : other)));
      if (field.max !== null) {
        const res = await call('POST', `/${form.resource}`, sized(field.max + 1));
        assert.equal(res.status, 400, `${path} : ${field.max + 1} éléments`);
        assert.ok(res.json.errors.some((e) => e.field === path), `${path} au-delà du maximum : ${JSON.stringify(fields(res))}`);
      }
      if (field.min > 1) {
        const res = await call('POST', `/${form.resource}`, sized(field.min - 1));
        assert.equal(res.status, 400, `${path} : ${field.min - 1} éléments`);
        assert.ok(res.json.errors.some((e) => e.field === path), `${path} sous le minimum : ${JSON.stringify(fields(res))}`);
      }
      if (field.correct) {
        const parent = path.replace(/\.[^.]+$/, '');
        const none = withPath(minimal, `${path}[0].${field.correct}`);
        const res = await call('POST', `/${form.resource}`, none);
        assert.ok(res.json.errors?.some((e) => e.field === `${parent}.correctAnswer`), `${path} sans bonne réponse : ${JSON.stringify(fields(res))}`);
      }
      // Variante limitée (un seul item « note » des faits du match) : max + 1 éléments refusés.
      for (const option of field.variants?.options ?? []) {
        if (option.max === undefined || option.max === null) continue;
        const item = { [field.variants.key]: option.value, ...sampleFrom(itemFields(field, option), { root: minimal }) };
        const res = await call('POST', `/${form.resource}`, withPath(minimal, path, Array.from({ length: option.max + 1 }, () => structuredClone(item))));
        assert.equal(res.status, 400, `${path} : ${option.max + 1} × ${option.value}`);
        assert.ok(res.json.errors.some((e) => e.field.startsWith(path)), `${path} : variante ${option.value} au-delà du maximum : ${JSON.stringify(fields(res))}`);
      }
    }

    for (const [path, field] of boundedNumbers(form.fields)) {
      for (const value of [field.min - 1, field.max + 1, 1.5]) {
        if (Number.isNaN(value)) continue;
        const res = await call('POST', `/${form.resource}`, withPath(minimal, path, value));
        assert.ok(res.json.errors?.some((e) => e.field === path), `${path} = ${value} refusé : ${JSON.stringify(res.json.errors ?? res.status)}`);
      }
    }
  });
}
