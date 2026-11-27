import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPollSaveData, buildCalendarSaveData, buildTinderSaveData, buildQuizSaveData, buildTeaserSaveData, buildFolderSaveData,
  buildNatinotesSaveData, buildPotmSaveData, buildFactsSaveData, buildPronoSaveData, buildTestimonySaveData,
  validatePoll, validateCalendar, validateTinder, validateQuiz, validateTeaser, validateFolder, validateNatinotes, validatePotm,
  validateFacts, validateProno, validateTestimony,
  transformWidgetData, widgetFormFromDoc, widgetEditInput, widgetStatsOnEdit, editRequestFieldKeys, requestFieldKeys,
  parseDate, parseDateTime, WIDGET_FORMS, WIDGET_EDIT_ID_LISTS,
} from '../index.js';
import { TEAMS } from './fixtures.js';

// Horodatage factice qui se relit comme un Timestamp Firestore.
const toTimestamp = (date) => ({ toDate: () => new Date(date.getTime()) });
const serverTimestamp = () => 'serverTimestamp';

// Requêtes de création (forme de l'API, valeurs déjà rognées et booléens explicites) et leur
// traduction vers l'entrée des règles partagées, comme `parse` dans apps/api.
const REQUESTS = {
  poll: { question: 'Faut-il\nla semaine de 4 jours ?', answers: [{ id: 'a', text: 'Oui' }, { id: 'b', text: 'Non' }], theme: 'Suisse', brand: 'pme' },
  calendar: {
    title: 'Coupe du monde',
    dates: [{ id: 'd1', text: 'Finale', start: '2026-12-20T20:45', complement: 'Lusail' }, { text: 'Demie', start: '2026-07-01T20:00' }],
    nbElemsToShow: 3,
    linkGlobal: { text: 'Programme', href: 'https://blick.ch', newTab: true },
    theme: 'Sport', brand: 'blick',
  },
  tinder: {
    label: 'Débat', title: 'Pour\nou contre ?', legend: 'Glisse à droite',
    cards: [{ id: 'c1', label: 'A', title: 'Un' }, { id: 'c2', label: 'B', title: 'Deux' }, { id: 'c3', label: 'C', title: 'Trois' }],
    theme: 'Suisse', brand: 'blick',
  },
  quiz: {
    title: 'Quiz',
    questions: [
      {
        id: 'q1', text: '2+2 ?', hint: 'Facile', img: 'https://cdn.example/q.webp', hidePercent: true,
        answers: [{ text: '3', isCorrect: false }, { text: '4', isCorrect: true }, { text: '5', isCorrect: false }, { text: '22', isCorrect: false }],
      },
      { id: 'q2', text: '3+3 ?', hidePercent: false, answers: ['6', '7', '8', '9'].map((text, i) => ({ text, isCorrect: i === 0 })) },
    ],
    conclusion: { text1: 'Raté', text2: 'Pas mal', text3: 'Bravo' },
    theme: 'Inter', brand: 'blick',
  },
  teaser: {
    label: 'Groenland', title: 'Ce pays que Trump\nveut prendre', img: 'https://cdn.example/t.webp',
    button: { text: "Vers l'article", href: 'https://www.blick.ch/fr/monde', newTab: false }, theme: 'Inter', brand: 'blick',
  },
  folder: {
    label: 'JO', labelColor: 'sport', name: 'Ne manquez rien\ndes JO', img: 'https://cdn.example/f.webp',
    buttons: [{ id: 'b1', text: 'Résultats', href: 'https://www.blick.ch/fr/jo', newTab: false }, { id: 'b2', text: 'Médailles', href: 'https://www.blick.ch/fr/m', newTab: true }],
    theme: 'Sport', brand: 'blick',
  },
  natinotes: {
    title: 'Notes Suisse - France',
    players: [{ id: 'granit-xhaka', blickRating: 5, comment: 'Patron du <strong>milieu</strong>.' }, { id: 'kylian-mbappe', blickRating: 4, comment: 'Discret &amp; efficace' }],
    showRecap: false, theme: 'Sport', brand: 'blick',
  },
  potm: {
    context: 'national_league', category: 'Dames', text: 'Berne - Ajoie', date: '2026-12-20',
    players: [{ id: 'p1', name: 'Alina Müller', position: 'Attaquant', team: 'Berne' }, { id: 'p2', name: 'Colin Muller', position: 'Entraîneur', team: 'Ajoie' }],
    theme: 'Sport', brand: 'blick',
  },
  facts: {
    title: 'Ajoie - Lausanne', date: '2026-12-20',
    items: [
      { id: 'i1', type: 'normal', icon: 'iconCross', title: "L'action", text: '<p>Un <strong>but</strong> splendide</p>' },
      { id: 'i2', type: 'quote', icon: 'iconQuote', title: 'La phrase', text: 'On a tenu.<br><br>Bravo.', author: '– Geoff Ward', picture: 'https://cdn.example/w.webp' },
      { id: 'i3', type: 'quote', icon: 'iconQuote', title: 'Sans photo', text: 'Oui.', author: 'X' },
      { id: 'i4', type: 'picture', icon: 'iconEye', title: "L'image", src: 'https://cdn.example/p.webp', text: '<p>La joie</p>', caption: 'Photo: Getty' },
      { id: 'i5', type: 'number', icon: 'iconHashtag', title: 'Le chiffre', value: 16, text: 'minutes <jouées> & plus' },
      { id: 'i6', type: 'rating', title: 'Et vous ?' },
    ],
    theme: 'Sport', brand: 'blick',
  },
  prono: { event: 'Coupe du monde UEFA 2026', date: '2026-06-15', team1: 'Suisse', team2: 'Canada', theme: 'Sport', brand: 'blick' },
  testimony: {
    title: 'Votre avis', subject: 'Primes maladie', question: 'Comment faites-vous\nface ?', timeExpires: '2026-12-20T20:45', theme: 'Suisse', brand: 'blick',
  },
};

const toInput = {
  poll: (r) => r,
  calendar: (r) => ({ ...r, dates: r.dates.map((d) => ({ ...d, start: parseDateTime(d.start) })) }),
  tinder: ({ legend, ...r }) => ({ ...r, legend: legend === undefined ? undefined : { txt: legend, display: true } }),
  quiz: (r) => r,
  teaser: (r) => r,
  folder: (r) => r,
  natinotes: (r) => r,
  potm: (r) => ({ ...r, date: parseDate(r.date) }),
  facts: (r) => ({ ...r, date: parseDate(r.date) }),
  prono: (r) => ({ ...r, date: parseDate(r.date) }),
  testimony: (r) => ({ ...r, timeExpires: r.timeExpires === undefined ? undefined : parseDateTime(r.timeExpires) }),
};

const RULES = {
  poll: [validatePoll, (i) => buildPollSaveData(i)],
  calendar: [validateCalendar, (i) => buildCalendarSaveData(i, { toTimestamp })],
  tinder: [validateTinder, (i) => buildTinderSaveData(i)],
  quiz: [validateQuiz, (i) => buildQuizSaveData(i)],
  teaser: [validateTeaser, (i) => buildTeaserSaveData(i)],
  folder: [validateFolder, (i) => buildFolderSaveData(i)],
  natinotes: [validateNatinotes, (i, deps) => buildNatinotesSaveData(i, deps)],
  potm: [validatePotm, (i) => buildPotmSaveData(i, { toTimestamp })],
  facts: [validateFacts, (i) => buildFactsSaveData(i, { toTimestamp })],
  prono: [validateProno, (i) => buildPronoSaveData(i, { toTimestamp })],
  testimony: [validateTestimony, (i) => buildTestimonySaveData(i, { toTimestamp })],
};

const docOf = (type, input, extra = {}, deps = { teams: TEAMS }) => {
  const [validate, build] = RULES[type];
  assert.deepEqual(validate(input, deps), []);
  return transformWidgetData({ ...build(input, deps), id: 'w1', author: 'a@ringier.ch', deleted: false, ...extra }, { serverTimestamp });
};

/** Modification comme l'API : ids et champs cachés repris, mêmes règles, compteurs du document relu. */
function edit(type, current, request) {
  const input = widgetEditInput(type, toInput[type](request), current);
  const deps = { teams: TEAMS, previousPlayers: current.data.players ?? [] };
  const next = docOf(type, input, {}, deps);
  return { ...next, stats: widgetStatsOnEdit(type, current, next) };
}

test('widgetFormFromDoc : aller-retour exact de la requête de création, pour les 11 formats', () => {
  assert.deepEqual(Object.keys(REQUESTS), WIDGET_FORMS.map(({ type }) => type));
  for (const [type, request] of Object.entries(REQUESTS)) {
    const form = widgetFormFromDoc(type, docOf(type, toInput[type](request)));
    assert.deepEqual(form, request, type);
    // Le formulaire relu passe le contrôle des champs d'une modification.
    const { root, nested } = editRequestFieldKeys(type);
    for (const key of Object.keys(form)) assert.ok(root.includes(key), `${type}.${key}`);
    const list = WIDGET_EDIT_ID_LISTS[type];
    if (list) assert.ok(nested[list].includes('id'), type);
  }
});

test('widgetFormFromDoc : ids générés relus, valeurs facultatives absentes, positions neutres', () => {
  const quiz = docOf('quiz', { ...REQUESTS.quiz, questions: REQUESTS.quiz.questions.map(({ id, ...q }) => q) });
  assert.deepEqual(widgetFormFromDoc('quiz', quiz).questions.map(({ id }) => id), quiz.data.questions.map(({ id }) => id));
  assert.match(quiz.data.questions[0].id, /^[0-9a-f-]{36}$/);

  const calendar = widgetFormFromDoc('calendar', docOf('calendar', toInput.calendar({ title: 'C', dates: [{ text: 'D', start: '2026-03-29T02:30Z' }], theme: 'Sport' })));
  assert.deepEqual(calendar, { title: 'C', dates: [{ text: 'D', start: '2026-03-29T04:30' }], theme: 'Sport', brand: 'blick' });

  const potm = widgetFormFromDoc('potm', docOf('potm', toInput.potm(REQUESTS.potm)));
  assert.deepEqual(potm.players.map(({ position }) => position), ['Attaquant', 'Entraîneur']);

  const testimony = widgetFormFromDoc('testimony', docOf('testimony', toInput.testimony({ ...REQUESTS.testimony, timeExpires: undefined })));
  assert.equal(Object.hasOwn(testimony, 'timeExpires'), false);

  // Couleur de dossier inconnue (ancien document) → couleur par défaut, pas une valeur refusée.
  const folder = docOf('folder', REQUESTS.folder);
  folder.data.folderLabelColor = 'bg-autre';
  assert.equal(widgetFormFromDoc('folder', folder).labelColor, 'brand');
});

test('editRequestFieldKeys : création sans author, + version, editor et id des éléments gardés', () => {
  assert.deepEqual(editRequestFieldKeys('poll'), { root: ['question', 'answers', 'theme', 'brand', 'version', 'editor'], nested: { answers: ['id', 'text'] } });
  assert.deepEqual(editRequestFieldKeys('tinder').nested.cards, ['id', 'label', 'title']);
  assert.deepEqual(editRequestFieldKeys('natinotes').nested, requestFieldKeys('natinotes').nested);
  assert.ok(!editRequestFieldKeys('quiz').nested['questions.answers'].includes('id'));
});

test('widgetEditInput : id stocké gardé une fois, id inconnu ou répété → nouvel élément', () => {
  const current = docOf('tinder', toInput.tinder(REQUESTS.tinder));
  const { cards } = widgetEditInput('tinder', { cards: [{ id: 'c2', label: 'B' }, { id: 'c2', label: 'B bis' }, { id: 'inconnu', label: 'X' }, 'pas un objet'] }, current);
  assert.deepEqual(cards, [{ id: 'c2', label: 'B' }, { label: 'B bis' }, { label: 'X' }, 'pas un objet']);

  const poll = docOf('poll', REQUESTS.poll);
  const { answers } = widgetEditInput('poll', { answers: [{ id: 'b', text: 'Non' }, { text: 'Peut-être' }, { id: 'zzz', text: 'Autre' }] }, poll);
  assert.equal(answers[0].id, 'b');
  assert.match(answers[1].id, /^[0-9a-f-]{36}$/);
  assert.notEqual(answers[2].id, 'zzz');
});

test('poll : votes gardés par id (réordonnancement), retirés avec la réponse, 0 pour une nouvelle', () => {
  const current = docOf('poll', REQUESTS.poll);
  current.stats = { views: 12, answerCounters: { a: 3, b: 5 } };
  const next = edit('poll', current, { ...REQUESTS.poll, answers: [{ id: 'b', text: 'Non !' }, { text: 'Bof' }] });
  const [b, bof] = next.data.answerTxts;
  assert.deepEqual(next.stats, { views: 12, answerCounters: { b: 5, [bof.id]: 0 } });
  assert.equal(b.text, 'Non !');
});

test('calendar / teaser / testimony : compteurs du document gardés ; lien global retiré → son compteur aussi', () => {
  const calendar = docOf('calendar', toInput.calendar(REQUESTS.calendar));
  calendar.stats = { views: 7, seeAllClicks: 4, globalLinkClicks: 2 };
  assert.deepEqual(edit('calendar', calendar, REQUESTS.calendar).stats, { views: 7, seeAllClicks: 4, globalLinkClicks: 2 });
  const { linkGlobal, ...withoutLink } = REQUESTS.calendar;
  assert.deepEqual(edit('calendar', calendar, withoutLink).stats, { views: 7, seeAllClicks: 4 });

  const teaser = docOf('teaser', REQUESTS.teaser);
  teaser.stats = { views: 9, clicks: 3 };
  assert.deepEqual(edit('teaser', teaser, { ...REQUESTS.teaser, title: 'Autre' }).stats, { views: 9, clicks: 3 });

  const testimony = docOf('testimony', toInput.testimony(REQUESTS.testimony));
  testimony.stats = { views: 5, msgSent: 2 };
  assert.deepEqual(edit('testimony', testimony, REQUESTS.testimony).stats, { views: 5, msgSent: 2 });
});

test('calendar : options avancées d\'une date gardée reprises par id', () => {
  const current = docOf('calendar', {
    ...toInput.calendar(REQUESTS.calendar),
    dates: [{ id: 'd1', text: 'Finale', start: parseDateTime('2026-12-20T20:45'), end: parseDateTime('2026-12-20T23:00'), showBadge: true, liveLinkEnabled: true, liveLinkUrl: 'https://live' }],
  });
  const next = edit('calendar', current, { ...REQUESTS.calendar, dates: [{ id: 'd1', text: 'Finale !', start: '2026-12-20T21:00' }, { text: 'Autre', start: '2026-12-21T10:00' }] });
  const [kept, added] = next.data.dates;
  assert.equal(kept.id, 'd1');
  assert.equal(kept.text, 'Finale !');
  assert.deepEqual([kept.scheduleEnd.toDate().toISOString(), kept.showBadge, kept.liveLinkExists, kept.liveLinkUrl], ['2026-12-20T22:00:00.000Z', true, true, 'https://live']);
  assert.deepEqual([added.id, added.scheduleEnd, added.showBadge, added.liveLinkExists], [undefined, null, false, false]);
});

test('tinder : votes par id de carte (anciens votes dans data compris)', () => {
  const current = docOf('tinder', toInput.tinder(REQUESTS.tinder));
  current.stats = { views: 1, tinderVotes: { c1: { yes: 1, no: 2 }, c2: { yes: 3, no: 4 }, c3: { yes: 5, no: 6 } } };
  const cards = [{ id: 'c3', label: 'C', title: 'Trois' }, { label: 'N', title: 'Nouveau' }, { id: 'c1', label: 'A', title: 'Un' }];
  const next = edit('tinder', current, { ...REQUESTS.tinder, cards });
  const added = next.data.tinderCards[1].id;
  assert.deepEqual(next.stats.tinderVotes, { c3: { yes: 5, no: 6 }, [added]: { yes: 0, no: 0 }, c1: { yes: 1, no: 2 } });

  delete current.stats.tinderVotes;
  current.data.tinderVotes = { c1: { yes: 9, no: 9 } };
  assert.deepEqual(edit('tinder', current, REQUESTS.tinder).stats.tinderVotes.c1, { yes: 9, no: 9 });
});

test('quiz : statistiques par id de question, distribution des scores ramenée à 0..n', () => {
  const current = docOf('quiz', REQUESTS.quiz);
  current.stats = {
    views: 4,
    statsQuestions: { q1: { correct: 5, incorrect: 1 }, q2: { correct: 2, incorrect: 4 } },
    statsGlobal: { scoreDistribution: { 0: 1, 1: 3, 2: 2 } },
  };
  const [q1, q2] = REQUESTS.quiz.questions;
  const added = { text: 'Nouvelle ?', hidePercent: false, answers: q2.answers };
  const next = edit('quiz', current, { ...REQUESTS.quiz, questions: [q2, added, q1] });
  const addedId = next.data.questions[1].id;
  assert.deepEqual(next.stats.statsQuestions, { q2: { correct: 2, incorrect: 4 }, [addedId]: { correct: 0, incorrect: 0 }, q1: { correct: 5, incorrect: 1 } });
  assert.deepEqual(next.stats.statsGlobal, { scoreDistribution: { 0: 1, 1: 3, 2: 2, 3: 0 } });

  const fewer = edit('quiz', current, { ...REQUESTS.quiz, questions: [q2] });
  assert.deepEqual(fewer.stats.statsQuestions, { q2: { correct: 2, incorrect: 4 } });
  assert.deepEqual(fewer.stats.statsGlobal.scoreDistribution, { 0: 1, 1: 3 });

  // Anciens quiz : statistiques en tableau par position.
  current.stats.statsQuestions = [{ correct: 7, incorrect: 0 }];
  assert.deepEqual(edit('quiz', current, REQUESTS.quiz).stats.statsQuestions.q1, { correct: 7, incorrect: 0 });
});

test('folder : clics par id de bouton, sinon ancien bouton au même lien', () => {
  const current = docOf('folder', REQUESTS.folder);
  current.stats = { views: 3, buttonClicks: { b1: 10, b2: 20 } };
  const next = edit('folder', current, { ...REQUESTS.folder, buttons: [{ id: 'b2', text: 'M', href: 'https://www.blick.ch/fr/m' }, { text: 'Nouveau', href: 'https://x.ch' }] });
  const added = next.data.buttons[1].id;
  assert.deepEqual(next.stats, { views: 3, buttonClicks: { b2: 20, [added]: 0 } });

  current.stats.buttonClicks = {};
  current.data.buttons[0].buttonCounterClicks = 8;
  const legacy = edit('folder', current, { ...REQUESTS.folder, buttons: [{ text: 'Résultats', href: 'https://www.blick.ch/fr/jo' }] });
  assert.deepEqual(Object.values(legacy.stats.buttonClicks), [8]);
});

test('natinotes : notes des joueurs gardés, retirées avec le joueur ; label et joueur archivé conservés', () => {
  const current = docOf('natinotes', REQUESTS.natinotes);
  current.data.label = 'Ancien label';
  current.data.players.push({ id: 'yann-sommer', name: 'Yann Sommer', team: 'Suisse', img: null, focal: { x: 50, y: 0, zoom: 1 }, blickRating: 6, comment: 'Mur' });
  current.stats = { views: 2, playerRatings: { 'granit-xhaka': { 5: 3 }, 'kylian-mbappe': { 1: 1 }, 'yann-sommer': { 6: 4 } } };
  const next = edit('natinotes', current, {
    ...REQUESTS.natinotes,
    players: [{ id: 'yann-sommer', blickRating: 5, comment: 'Mur' }, { id: 'granit-xhaka', blickRating: 4, comment: 'Bien' }, { id: 'breel-embolo', blickRating: 3, comment: 'Entré' }],
  });
  assert.equal(next.data.label, 'Ancien label');
  assert.deepEqual(next.data.players.map(({ id, name }) => [id, name]), [['yann-sommer', 'Yann Sommer'], ['granit-xhaka', 'Granit Xhaka'], ['breel-embolo', 'Breel Embolo']]);
  assert.deepEqual(next.stats, { views: 2, playerRatings: { 'yann-sommer': { 6: 4 }, 'granit-xhaka': { 5: 3 } } });
});

test('potm : votes par id de candidat, sinon ancien candidat du même nom', () => {
  const current = docOf('potm', toInput.potm(REQUESTS.potm));
  current.stats = { views: 1, playersVotes: { p1: 11, p2: 4 } };
  const players = [{ id: 'p2', name: 'Colin Muller', position: 'Entraîneur', team: 'Ajoie' }, { name: 'Nouvelle', position: 'Gardien', team: 'Berne' }];
  const next = edit('potm', current, { ...REQUESTS.potm, players });
  const added = next.data.players[1].id;
  assert.deepEqual(next.stats.playersVotes, { p2: 4, [added]: 0 });
  assert.equal(next.data.players[1].position, 'Gardienne');

  current.stats.playersVotes = {};
  current.data.players[0].votes = 6;
  const legacy = edit('potm', current, { ...REQUESTS.potm, players: [{ name: 'Alina Müller', position: 'Attaquant', team: 'Berne' }, players[0]] });
  assert.deepEqual(Object.values(legacy.stats.playersVotes), [6, 0]);
});

test('facts : vues, révélations et avis gardés, anciens compteurs par élément retirés', () => {
  const current = docOf('facts', toInput.facts(REQUESTS.facts));
  current.stats = { views: 8, reveal: 3, ratingStats: { 4: 2, 5: 1 }, itemCounters: { i1: 1 } };
  const next = edit('facts', current, { ...REQUESTS.facts, items: REQUESTS.facts.items.slice(0, 2).reverse() });
  assert.deepEqual(next.data.items.map(({ id }) => id), ['i2', 'i1']);
  assert.deepEqual(next.stats, { views: 8, reveal: 3, ratingStats: { 4: 2, 5: 1 } });
});

test('prono : votes par issue gardés ; couleur gardée pour une équipe inchangée, sinon celle de la nouvelle équipe', () => {
  const current = docOf('prono', toInput.prono({ ...REQUESTS.prono, color1: '#123456', color2: '#abcdef' }));
  current.stats = { views: 6, itemVotes: { item1: 10, item2: 20, item3: 5 } };
  const next = edit('prono', current, { ...REQUESTS.prono, team2: 'Italie' });
  assert.deepEqual(next.stats, { views: 6, itemVotes: { item1: 10, item2: 20, item3: 5 } });
  assert.equal(next.data.pronoData.item1.color, '#123456');
  assert.notEqual(next.data.pronoData.item2.color, '#abcdef');
  assert.equal(next.meta.title, 'Suisse - Italie');
});
