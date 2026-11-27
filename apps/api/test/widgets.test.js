import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { transformWidgetData, buildCalendarSaveData, buildTinderSaveData, buildQuizSaveData } from '@rms/widget-model';
import { createApp } from '../src/app.js';
import { createCallerVerifier } from '../src/auth.js';
import { AlreadyExistsError } from '../src/errors.js';
import { ImageError, fetchImageSafely, isPublicAddress, toDashboardWebp, IMAGE_TARGET_BYTES } from '../src/images.js';
import { UPLOAD_PREFIX, parseStorageUrl } from '../src/imageStore.js';
import { parseDateTime } from '../src/dates.js';

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

let docs;
let nextId;
let failNextCreate;
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
  assert.equal(patch.headers.get('allow'), 'GET');
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
  assert.deepEqual(gotCal.json, {
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
