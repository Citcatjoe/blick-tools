import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { validatePoll, buildPollSaveData, transformWidgetData } from '@rms/widget-model';
import { createApp } from '../src/app.js';
import { createCallerVerifier } from '../src/auth.js';
import { createFirestoreStore } from '../src/firestoreStore.js';
import { AlreadyExistsError } from '../src/errors.js';

const AUDIENCE = 'https://blick-tools-api.test';
const BASE = 'https://example.test/bl-tools-client-';
const HUB = 'hub@hub-project.iam.gserviceaccount.com';
const OTHER_HUB = 'hub-preprod@hub-project.iam.gserviceaccount.com';
const TS = 'server-timestamp';

// Client OIDC factice : la vérification cryptographique est celle de google-auth-library ;
// ici on teste ce que le service fait du résultat (audience, e-mail vérifié, liste blanche).
const TOKENS = {
  hub: { email: HUB, email_verified: true },
  otherHub: { email: OTHER_HUB, email_verified: true },
  stranger: { email: 'intrus@evil.iam.gserviceaccount.com', email_verified: true },
  unverified: { email: HUB, email_verified: false },
};
const fakeOidcClient = {
  async getFederatedSignonCertsAsync() {
    return { certs: {} };
  },
  async verifyIdToken({ idToken, audience }) {
    if (!TOKENS[idToken] || audience !== AUDIENCE) throw new Error(`Wrong recipient ${idToken}`);
    return { getPayload: () => TOKENS[idToken] };
  },
};

let docs;
let nextId;
const memoryStore = {
  serverTimestamp: () => TS,
  newId: () => `auto${++nextId}`,
  async create(id, doc) {
    if (docs.has(id)) throw new AlreadyExistsError();
    docs.set(id, structuredClone(doc));
  },
  async get(id) {
    return docs.get(id) ?? null;
  },
  async update(id, compute) {
    const current = docs.get(id) ?? null;
    const result = compute(current); // lève ApiError (404/400) comme la transaction réelle
    if (result?.patch) {
      const merged = structuredClone(current);
      for (const [path, value] of Object.entries(result.patch)) setPath(merged, path, value);
      docs.set(id, merged);
    }
    return result;
  },
};

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cursor = obj;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
  cursor[keys.at(-1)] = value;
}

function seedPoll({ id = 'poll1', question = 'Q ?', answers = [{ id: 'a', text: 'Oui' }, { id: 'b', text: 'Non' }], votes = { a: 3, b: 5 }, theme = 'Suisse', brand = 'blick' } = {}) {
  docs.set(id, {
    type: 'poll',
    meta: { id, brand, theme, author: 'Hub Rédaction', deleted: false, timeCreated: TS, timeUpdated: TS, title: question },
    stats: { views: 0, answerCounters: { ...votes } },
    data: { question, answerTxts: answers },
  });
}

let server;
let url;
before(async () => {
  const handler = createApp({
    verifyCaller: createCallerVerifier({ audience: AUDIENCE, allowedCallers: new Set([HUB, OTHER_HUB]), client: fakeOidcClient }),
    store: memoryStore,
    clientBaseUrl: BASE,
    log: () => {},
  });
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  docs = new Map();
  nextId = 0;
});

const VALID = { question: ' Semaine de 4 jours ? ', answers: ['Oui', ' Non '], theme: 'Suisse' };

async function post(body, { token = 'hub', headers = {}, path = '/polls', method = 'POST' } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  return { status: response.status, headers: response.headers, json: await response.json() };
}

async function get(path, token = 'hub') {
  const response = await fetch(`${url}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, headers: response.headers, json: await response.json() };
}

async function patch(path, body, token = 'hub') {
  const response = await fetch(`${url}${path}`, {
    method: 'PATCH',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, json: await response.json() };
}

test('201 : renvoie id + embedUrl et écrit le document de la fabrique partagée', async () => {
  const res = await post({ ...VALID, brand: 'pme', author: 'jane.doe@ringier.ch' });

  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { id: 'auto1', embedUrl: `${BASE}poll/?pollDoc=auto1&brand=pme` });
  assert.equal(docs.size, 1);

  const stored = docs.get('auto1');
  const answers = stored.data.answerTxts;
  assert.equal(new Set(answers.map((a) => a.id)).size, 2);
  // Même entrée côté dashboard (mêmes ids) → document identique.
  const dashboardInput = { question: VALID.question, answers: VALID.answers.map((text, i) => ({ id: answers[i].id, text })), brand: 'pme', theme: 'Suisse' };
  assert.deepEqual(validatePoll(dashboardInput), []);
  const expected = transformWidgetData(
    { ...buildPollSaveData(dashboardInput), id: 'auto1', author: 'jane.doe@ringier.ch', deleted: false },
    { serverTimestamp: () => TS },
  );
  assert.deepEqual(stored, expected);
  assert.deepEqual(stored.stats.answerCounters, { [answers[0].id]: 0, [answers[1].id]: 0 });
  assert.equal(stored.data.question, 'Semaine de 4 jours ?');
});

test('201 : marque et auteur par défaut', async () => {
  const res = await post(VALID);
  assert.equal(res.status, 201);
  assert.equal(res.json.embedUrl, `${BASE}poll/?pollDoc=auto1&brand=blick`);
  const { meta } = docs.get('auto1');
  assert.equal(meta.brand, 'blick');
  assert.equal(meta.author, 'Hub Rédaction');
});

test('400 VALIDATION_FAILED : toutes les violations, rien n\'est écrit', async () => {
  const res = await post({ question: '  ', answers: ['Oui', ''], theme: 'sport', brand: 'letemps', author: 'jane', rubrique: 'Sport' });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('content-type'), 'application/problem+json; charset=utf-8');
  assert.equal(res.json.code, 'VALIDATION_FAILED');
  assert.deepEqual(
    res.json.errors.map(({ field, code }) => [field, code]),
    [
      ['rubrique', 'unknown_field'],
      ['theme', 'invalid_value'],
      ['question', 'required'],
      ['answers[1]', 'required'],
      ['brand', 'invalid_value'],
      ['author', 'invalid_value'],
    ],
  );
  assert.equal(docs.size, 0);
});

test('400 : corps non objet, JSON illisible, Idempotency-Key invalide', async () => {
  assert.equal((await post([VALID])).json.errors[0].field, 'body');
  const broken = await post('{"question":');
  assert.equal(broken.status, 400);
  assert.equal(broken.json.code, 'INVALID_JSON');
  const badKey = await post(VALID, { headers: { 'Idempotency-Key': 'a b' } });
  assert.equal(badKey.json.code, 'INVALID_IDEMPOTENCY_KEY');
  assert.equal(docs.size, 0);
});

test('401 / 403 : identité absente, invalide, non vérifiée ou hors liste blanche', async () => {
  for (const token of [null, 'forged', 'unverified']) {
    const res = await post(VALID, { token });
    assert.equal(res.status, 401, String(token));
    assert.equal(res.json.code, 'UNAUTHENTICATED');
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  }
  const forbidden = await post(VALID, { token: 'stranger' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.code, 'FORBIDDEN');
  assert.equal(docs.size, 0);
});

test('401 avant tout contrôle du corps', async () => {
  const res = await post('pas du json', { token: null, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(res.status, 401);
});

test('404 / 405 / 413 / 415', async () => {
  assert.equal((await post(VALID, { path: '/poll' })).json.code, 'NOT_FOUND');
  const get = await post(undefined, { method: 'GET' });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  const tooLarge = await post({ ...VALID, question: 'x'.repeat(70 * 1024) });
  assert.equal(tooLarge.status, 413);
  const form = await post('question=x', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  assert.equal(docs.size, 0);
});

test('Idempotency-Key : rejeu identique → 200 même sondage, contenu différent → 409', async () => {
  const headers = { 'Idempotency-Key': 'article-42' };
  const first = await post(VALID, { headers });
  assert.equal(first.status, 201);
  assert.match(first.json.id, /^[0-9a-f]{20}$/);

  const replay = await post(VALID, { headers });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  assert.deepEqual(replay.json, first.json);
  assert.equal(docs.size, 1);

  const conflict = await post({ ...VALID, question: 'Autre question ?' }, { headers });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(docs.size, 1);

  const otherCaller = await post(VALID, { headers, token: 'otherHub' });
  assert.equal(otherCaller.status, 201);
  assert.notEqual(otherCaller.json.id, first.json.id);
});

test('Firestore indisponible → 503 rejouable ; erreur inconnue → 500 sans fuite', async () => {
  const failing = (code) => ({
    collection: () => ({
      doc: () => ({ id: 'x', create: async () => { throw Object.assign(new Error('boom'), { code }); } }),
    }),
  });
  for (const [code, status] of [[14, 503], [7, 500]]) {
    const handler = createApp({
      verifyCaller: async () => ({ email: HUB }),
      store: { ...createFirestoreStore(failing(code)), serverTimestamp: () => TS },
      clientBaseUrl: BASE,
      log: () => {},
    });
    const local = http.createServer(handler);
    await new Promise((resolve) => local.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${local.address().port}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID),
    });
    const json = await response.json();
    local.close();
    assert.equal(response.status, status);
    if (status === 503) assert.equal(response.headers.get('retry-after'), '5');
    assert.ok(!JSON.stringify(json).includes('boom'));
  }
});

test('GET /polls/{id} : réponses ordonnées, votes et total', async () => {
  seedPoll({ votes: { a: 3, b: 5 } });
  const res = await get('/polls/poll1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, {
    id: 'poll1',
    embedUrl: `${BASE}poll/?pollDoc=poll1&brand=blick`,
    question: 'Q ?',
    answers: [
      { id: 'a', text: 'Oui', votes: 3 },
      { id: 'b', text: 'Non', votes: 5 },
    ],
    totalVotes: 8,
    theme: 'Suisse',
    brand: 'blick',
  });
});

test('PATCH ne change que les textes et garde les votes', async () => {
  seedPoll({ votes: { a: 3, b: 5 } });
  const res = await patch('/polls/poll1', {
    editor: 'jane.doe@ringier.ch',
    question: '  Nouvelle ?  ',
    answers: [{ id: 'a', text: 'Oui !' }, { id: 'b', text: 'Non !' }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.question, 'Nouvelle ?');
  assert.deepEqual(res.json.answers, [
    { id: 'a', text: 'Oui !', votes: 3 },
    { id: 'b', text: 'Non !', votes: 5 },
  ]);
  assert.equal(res.json.totalVotes, 8);

  const doc = docs.get('poll1');
  assert.deepEqual(doc.stats.answerCounters, { a: 3, b: 5 });
  assert.equal(doc.data.question, 'Nouvelle ?');
  assert.equal(doc.meta.title, 'Nouvelle ?'); // titre de la liste dashboard
  assert.deepEqual(doc.data.answerTxts, [{ id: 'a', text: 'Oui !' }, { id: 'b', text: 'Non !' }]);
  assert.equal(doc.meta.updatedBy, 'jane.doe@ringier.ch');
});

test('PATCH refuse des ids différents, en nombre différent ou réordonnés', async () => {
  seedPoll();
  const reorder = await patch('/polls/poll1', { editor: 'jane@ringier.ch', answers: [{ id: 'b', text: 'Non' }, { id: 'a', text: 'Oui' }] });
  assert.equal(reorder.status, 400);
  assert.deepEqual(reorder.json.errors.map(({ field, code }) => [field, code]), [
    ['answers[0]', 'invalid_value'],
    ['answers[1]', 'invalid_value'],
  ]);

  const fewer = await patch('/polls/poll1', { editor: 'jane@ringier.ch', answers: [{ id: 'a', text: 'Oui' }] });
  assert.equal(fewer.status, 400);
  assert.deepEqual(fewer.json.errors.map(({ field, code }) => [field, code]), [['answers', 'invalid_value']]);

  const differentId = await patch('/polls/poll1', { editor: 'jane@ringier.ch', answers: [{ id: 'a', text: 'Oui' }, { id: 'X', text: 'Non' }] });
  assert.equal(differentId.status, 400);
  assert.deepEqual(differentId.json.errors.map(({ field }) => [field]), [['answers[1]']]);

  // rien n'a bougé
  assert.deepEqual(docs.get('poll1').data.answerTxts, [{ id: 'a', text: 'Oui' }, { id: 'b', text: 'Non' }]);
});

test('PATCH : theme et brand sont des champs inconnus (surface réduite)', async () => {
  seedPoll();
  const res = await patch('/polls/poll1', { editor: 'jane@ringier.ch', theme: 'Suisse', brand: 'pme', question: 'Q ?' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json.errors.map(({ field, code }) => [field, code]), [
    ['theme', 'unknown_field'],
    ['brand', 'unknown_field'],
  ]);
});

test('GET/PATCH sur un id inconnu ou non-poll → 404', async () => {
  assert.equal((await get('/polls/nope')).status, 404);
  assert.equal((await patch('/polls/nope', { editor: 'jane@ringier.ch', question: 'y' })).status, 404);
  docs.set('quiz1', { type: 'quiz', meta: { id: 'quiz1', brand: 'blick', theme: '' }, stats: {}, data: {} });
  assert.equal((await get('/polls/quiz1')).status, 404);
});

test('GET/PATCH hors liste blanche → 403', async () => {
  seedPoll();
  assert.equal((await get('/polls/poll1', 'stranger')).status, 403);
  assert.equal((await patch('/polls/poll1', { editor: 'x', question: 'y' }, 'stranger')).status, 403);
});

test('PATCH : champ inconnu, question vide, réponse vide, éditeur manquant → 400 groupé', async () => {
  seedPoll();
  const res = await patch('/polls/poll1', {
    editor: '   ',
    question: '  ',
    answers: [{ id: 'a', text: '   ' }, { id: 'b', text: 'Non' }],
    rubrique: 'Sport',
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'VALIDATION_FAILED');
  assert.deepEqual(res.json.errors.map(({ field, code }) => [field, code]), [
    ['rubrique', 'unknown_field'],
    ['question', 'required'],
    ['answers[0]', 'required'],
    ['editor', 'required'],
  ]);
});
