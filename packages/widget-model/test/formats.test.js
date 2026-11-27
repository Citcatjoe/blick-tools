import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTeaser, buildTeaserSaveData,
  validateFolder, buildFolderSaveData, FOLDER_MAX_BUTTONS,
  validateNatinotes, buildNatinotesSaveData, listTeamsForPicker, NATINOTES_RATINGS,
  validatePotm, buildPotmSaveData, POTM_TEAMS, potmPositionForCategory,
  validateFacts, buildFactsSaveData, FACTS_ITEM_FIELDS, FACTS_RATING_ICON,
  normalizeFocal, transformWidgetData,
} from '../index.js';
import { SAMPLES, TEAMS, fields, serverTimestamp, toTimestamp } from './fixtures.js';

const toDoc = (saveData) => transformWidgetData({ ...saveData, author: 'journaliste@ringier.ch', deleted: false }, { serverTimestamp });
const META_KEYS = ['id', 'brand', 'theme', 'author', 'deleted', 'timeCreated', 'timeUpdated', 'title'];
const keys = (object) => Object.keys(object).sort();
// Ids générés : remplacés par leur rang pour comparer deux documents.
const stableIds = (doc, ids) => JSON.parse(ids.reduce((json, id, index) => json.replaceAll(id, `id${index}`), JSON.stringify(doc)));

// ---------- Teaser ----------

test('validateTeaser : champs obligatoires, image https, lien http(s), dans l\'ordre du formulaire', () => {
  assert.deepEqual(validateTeaser(SAMPLES.teaser), []);
  assert.deepEqual(fields(validateTeaser({ brand: 'pme' })), [
    ['theme', 'required'],
    ['label', 'required'],
    ['title', 'required'],
    ['img', 'required'],
    ['button.text', 'required'],
    ['button.href', 'required'],
    ['brand', 'invalid_value'],
  ]);
  const withButton = (button) => fields(validateTeaser({ ...SAMPLES.teaser, button }));
  assert.deepEqual(withButton({ text: 'Lire', href: 'javascript:alert(1)' }), [['button.href', 'invalid_value']]);
  assert.deepEqual(withButton({ text: ' ', href: 'https://x.ch', newTab: 'oui' }), [['button.text', 'required'], ['button.newTab', 'invalid_type']]);
  assert.deepEqual(fields(validateTeaser({ ...SAMPLES.teaser, img: 'http://cdn/x.jpg', theme: 'Météo' })), [['theme', 'invalid_value'], ['img', 'invalid_value']]);
});

test('teaser : document du dashboard (titre en \\n littéral, bouton en linkGlobal*, clics à 0)', () => {
  const doc = toDoc(buildTeaserSaveData(SAMPLES.teaser));
  assert.equal(doc.type, 'teaser');
  assert.deepEqual(keys(doc.meta), [...META_KEYS].sort());
  assert.deepEqual(doc.stats, { views: 0, clicks: 0 });
  assert.deepEqual(doc.data, {
    title: 'Ce pays que Trump\\nveut prendre par la force',
    label: 'Groenland',
    img: SAMPLES.teaser.img,
    linkGlobalTxt: "Vers l'article",
    linkGlobalHref: 'https://www.blick.ch/fr/monde',
    linkGlobalNewTab: false,
  });
  assert.equal(doc.meta.title, 'Ce pays que Trump veut prendre par la force');
  assert.equal(doc.meta.brand, 'blick');
  assert.equal(buildTeaserSaveData({ ...SAMPLES.teaser, title: 'a\r\nb', button: { ...SAMPLES.teaser.button, newTab: true } }).teaserTitle, 'a\\nb');
});

test('teaser : même document que l\'ancien chemin de Form.jsx', () => {
  const legacy = {
    type: 'teaser', teaserLabel: 'Groenland', teaserTitle: 'Ce pays que Trump\\nveut prendre par la force',
    linkGlobalTxt: "Vers l'article", linkGlobalHref: 'https://www.blick.ch/fr/monde', linkGlobalNewTab: false,
    img: SAMPLES.teaser.img, brand: 'blick', theme: 'Inter', counterViews: 0, counterClicks: 0,
  };
  assert.deepEqual(toDoc(buildTeaserSaveData(SAMPLES.teaser)), toDoc(legacy));
});

// ---------- Dossier ----------

test('validateFolder : 1 à 4 boutons complets, couleur brand|sport', () => {
  assert.deepEqual(validateFolder(SAMPLES.folder), []);
  assert.deepEqual(validateFolder({ ...SAMPLES.folder, labelColor: undefined }), []);
  const button = SAMPLES.folder.buttons[0];
  assert.deepEqual(fields(validateFolder({ ...SAMPLES.folder, buttons: [] })), [['buttons', 'too_few']]);
  assert.deepEqual(fields(validateFolder({ ...SAMPLES.folder, buttons: undefined })), [['buttons', 'required']]);
  assert.deepEqual(validateFolder({ ...SAMPLES.folder, buttons: Array(FOLDER_MAX_BUTTONS).fill(button) }), []);
  assert.deepEqual(fields(validateFolder({ ...SAMPLES.folder, buttons: Array(FOLDER_MAX_BUTTONS + 1).fill(button) })), [['buttons', 'too_many']]);
  assert.deepEqual(fields(validateFolder({
    ...SAMPLES.folder,
    labelColor: 'bg-sport',
    name: '',
    buttons: [{ text: '', href: 'https://x.ch' }, { text: 'B', href: 'ftp://x' }, 'C'],
  })), [
    ['labelColor', 'invalid_value'],
    ['name', 'required'],
    ['buttons[0].text', 'required'],
    ['buttons[1].href', 'invalid_value'],
    ['buttons[2]', 'invalid_type'],
  ]);
});

test('dossier : classes de couleur, id et compteur de clics à 0 par bouton', () => {
  const doc = toDoc(buildFolderSaveData(SAMPLES.folder));
  const ids = doc.data.buttons.map(({ id }) => id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(keys(doc.data), ['buttons', 'folderLabel', 'folderLabelColor', 'folderName', 'img']);
  assert.equal(doc.data.folderName, 'Ne manquez rien\\ndes Jeux Olympiques');
  assert.equal(doc.data.folderLabelColor, 'bg-sport');
  assert.deepEqual(doc.data.buttons[1], { id: ids[1], buttonTxt: 'Médailles', buttonUrl: 'http://www.blick.ch/fr/sport/medailles', buttonOpensNewTab: true });
  assert.deepEqual(doc.stats, { views: 0, buttonClicks: { [ids[0]]: 0, [ids[1]]: 0 } });
  assert.equal(doc.meta.title, 'Ne manquez rien des Jeux Olympiques');
  assert.equal(buildFolderSaveData({ ...SAMPLES.folder, labelColor: undefined }).folderLabelColor, 'bg-brand');
  assert.equal(buildFolderSaveData({ ...SAMPLES.folder, buttons: [{ ...SAMPLES.folder.buttons[0], id: 'keep' }] }).buttons[0].id, 'keep');

  const legacy = {
    type: 'folder', folderName: 'Ne manquez rien\\ndes Jeux Olympiques', folderLabel: 'JO', folderLabelColor: 'bg-sport', img: SAMPLES.folder.img,
    buttons: SAMPLES.folder.buttons.map((b, i) => ({ id: ids[i], buttonTxt: b.text, buttonUrl: b.href, buttonOpensNewTab: b.newTab || false, buttonCounterClicks: 0 })),
    brand: 'blick', theme: 'Sport',
  };
  assert.deepEqual(doc, toDoc(legacy));
});

// ---------- NatiNotes ----------

test('validateNatinotes : joueur des effectifs, non archivé, sans doublon ; note 1 à 6 ; paragraphe non vide', () => {
  const deps = { teams: TEAMS };
  assert.deepEqual(validateNatinotes(SAMPLES.natinotes, deps), []);
  assert.deepEqual(fields(validateNatinotes({ ...SAMPLES.natinotes, players: [] }, deps)), [['players', 'too_few']]);
  const player = (patch) => ({ id: 'granit-xhaka', blickRating: 3, comment: 'ok', ...patch });
  assert.deepEqual(fields(validateNatinotes({
    theme: 'Sport',
    title: ' ',
    showRecap: 'oui',
    players: [
      player({}),
      player({}),
      player({ id: 'yann-sommer' }),
      player({ id: 'inconnu' }),
      player({ id: '' }),
      player({ id: 'breel-embolo', blickRating: 7 }),
      player({ id: 'kylian-mbappe', blickRating: '5', comment: '<p><br></p>' }),
      player({ id: 'x1', blickRating: null, comment: '<script>alert(1)</script>' }),
    ],
  }, deps)), [
    ['title', 'required'],
    ['players[1].id', 'duplicate'],
    ['players[2].id', 'invalid_value'],
    ['players[3].id', 'invalid_value'],
    ['players[4].id', 'required'],
    ['players[5].blickRating', 'invalid_value'],
    ['players[6].blickRating', 'invalid_value'],
    ['players[6].comment', 'required'],
    ['players[7].id', 'invalid_value'],
    ['players[7].blickRating', 'required'],
    ['players[7].comment', 'required'],
    ['showRecap', 'invalid_type'],
  ]);
  for (const rating of NATINOTES_RATINGS) assert.deepEqual(validateNatinotes({ ...SAMPLES.natinotes, players: [player({ blickRating: rating })] }, deps), []);
  // Sans catalogue, aucun joueur n'est reconnu
  assert.deepEqual(fields(validateNatinotes(SAMPLES.natinotes)), [['players[0].id', 'invalid_value'], ['players[1].id', 'invalid_value']]);
});

test('natinotes : instantané recopié de l\'effectif, paragraphe nettoyé, récap affiché par défaut', () => {
  const save = buildNatinotesSaveData({ ...SAMPLES.natinotes, players: [...SAMPLES.natinotes.players, { id: 'breel-embolo', blickRating: 2, comment: '<p>Absent</p>' }] }, { teams: TEAMS });
  const doc = toDoc(save);
  assert.deepEqual(keys(doc.data), ['label', 'players', 'showRecap', 'title']);
  assert.deepEqual(doc.stats, { views: 0, playerRatings: {} });
  assert.equal(doc.meta.title, 'Notes du match Suisse - France');
  assert.deepEqual(doc.data.players, [
    { id: 'granit-xhaka', name: 'Granit Xhaka', team: 'Suisse', img: 'https://cdn.example/xhaka.webp', focal: { x: 40, y: 10, zoom: 1.5 }, blickRating: 5, comment: 'Patron du <strong>milieu</strong>.' },
    { id: 'kylian-mbappe', name: 'Kylian Mbappé', team: 'France', img: null, focal: { x: 100, y: 0, zoom: 1 }, blickRating: 4, comment: 'Discret &amp; efficace' },
    { id: 'breel-embolo', name: 'Breel Embolo', team: 'Suisse M21', img: null, focal: { x: 50, y: 0, zoom: 1 }, blickRating: 2, comment: 'Absent' }, // sans paragraphes, comme le champ du dashboard
  ]);
  assert.equal(doc.data.label, '');
  assert.equal(doc.data.showRecap, true);
  assert.equal(buildNatinotesSaveData({ ...SAMPLES.natinotes, showRecap: false }, { teams: TEAMS }).showRecap, false);
});

test('natinotes (édition dashboard) : un joueur déjà enregistré reste accepté, archivé ou retiré de l\'effectif', () => {
  const previousPlayers = [
    { id: 'yann-sommer', name: 'Yann Sommer', team: 'Suisse', img: 'https://cdn.example/sommer.webp', focal: { x: 10, y: 10, zoom: 2 } },
    { id: 'ancien', name: 'Ancien Joueur', team: 'Suisse', img: null },
  ];
  const input = { ...SAMPLES.natinotes, players: [{ id: 'yann-sommer', blickRating: 6, comment: 'x' }, { id: 'ancien', blickRating: 1, comment: 'y' }] };
  assert.deepEqual(validateNatinotes(input, { teams: TEAMS, previousPlayers }), []);
  const [sommer, ancien] = buildNatinotesSaveData(input, { teams: TEAMS, previousPlayers }).players;
  // L'effectif fait foi quand le joueur y figure encore (cadrage gardé s'il n'en a pas) ; sinon l'instantané enregistré
  assert.deepEqual([sommer.name, sommer.team, sommer.img, sommer.focal], ['Yann Sommer', 'Suisse', null, { x: 10, y: 10, zoom: 2 }]);
  assert.deepEqual([ancien.name, ancien.team, ancien.img, ancien.focal], ['Ancien Joueur', 'Suisse', null, normalizeFocal()]);
});

test('listTeamsForPicker : archivés exclus, équipes et joueurs triés par nom, équipe et cadrage résolus', () => {
  assert.deepEqual(listTeamsForPicker(TEAMS), [
    { id: 'france', name: 'France', players: [{ id: 'kylian-mbappe', name: 'Kylian Mbappé', team: 'France', img: null, focal: { x: 100, y: 0, zoom: 1 } }] },
    {
      id: 'suisse',
      name: 'Suisse',
      players: [
        { id: 'breel-embolo', name: 'Breel Embolo', team: 'Suisse M21', img: null, focal: { x: 50, y: 0, zoom: 1 } },
        { id: 'granit-xhaka', name: 'Granit Xhaka', team: 'Suisse', img: 'https://cdn.example/xhaka.webp', focal: { x: 40, y: 10, zoom: 1.5 } },
      ],
    },
  ]);
  assert.deepEqual(listTeamsForPicker(undefined), []);
});

// ---------- Joueur du match ----------

test('validatePotm : contexte, catégorie, au moins 2 candidats, poste et équipe du contexte', () => {
  assert.deepEqual(validatePotm(SAMPLES.potm), []);
  const players = SAMPLES.potm.players;
  assert.deepEqual(fields(validatePotm({ ...SAMPLES.potm, players: players.slice(0, 1) })), [['players', 'too_few']]);
  assert.deepEqual(fields(validatePotm({
    theme: 'Sport',
    context: 'hockey',
    category: 'Mixte',
    text: '',
    date: new Date('pas une date'),
    players: [
      { name: '', position: 'Attaquante', team: 'Berne' },
      { name: 'B', team: 'Atlantide' },
    ],
  })), [
    ['context', 'invalid_value'],
    ['category', 'invalid_value'],
    ['text', 'required'],
    ['date', 'invalid_value'],
    ['players[0].name', 'required'],
    ['players[0].position', 'invalid_value'],
    ['players[1].position', 'required'],
    ['players[1].team', 'invalid_value'],
  ]);
  // Équipe d'un autre contexte
  assert.deepEqual(fields(validatePotm({ ...SAMPLES.potm, players: [players[0], { ...players[1], team: 'Suisse' }] })), [['players[1].team', 'invalid_value']]);
  assert.deepEqual(fields(validatePotm({ ...SAMPLES.potm, context: undefined, category: undefined, date: undefined })), [['context', 'required'], ['category', 'required'], ['date', 'required']]);
});

test('potm : poste accordé à la catégorie (entraîneur·euse inchangé)', () => {
  const dames = ['Attaquant', 'Défenseur', 'Milieu', 'Gardien', 'Entraîneur', 'Entraîneuse'].map((p) => potmPositionForCategory(p, 'Dames'));
  assert.deepEqual(dames, ['Attaquante', 'Défenseuse', 'Milieu', 'Gardienne', 'Entraîneur', 'Entraîneuse']);
  const messieurs = ['Attaquant', 'Entraîneuse'].map((p) => potmPositionForCategory(p, 'Messieurs'));
  assert.deepEqual(messieurs, ['Attaquant', 'Entraîneuse']);
});

test('potm : équipe complétée par teams.json, votes à 0 par candidat, date horodatée', () => {
  const doc = toDoc(buildPotmSaveData(SAMPLES.potm, { toTimestamp }));
  const ids = doc.data.players.map(({ id }) => id);
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(keys(doc.data), ['context', 'players']);
  assert.deepEqual(doc.data.context, { context: 'national_league', category: 'Dames', text: 'Berne - Ajoie', date: { iso: '2026-12-20T11:00:00.000Z' } });
  assert.deepEqual(doc.data.players[0], { id: ids[0], name: 'Alina Müller', position: 'Attaquante', team: 'Berne', code: 'scb', color: '#E1001A', type: 'national_league', img: 'ch_berne.png' });
  assert.deepEqual(doc.data.players.map((p) => p.position), ['Attaquante', 'Défenseuse', 'Gardienne', 'Entraîneur']);
  assert.deepEqual(doc.stats, { views: 0, playersVotes: Object.fromEntries(ids.map((id) => [id, 0])) });
  assert.equal(doc.meta.title, 'Berne - Ajoie');

  const national = buildPotmSaveData({ ...SAMPLES.potm, context: 'national', category: 'Messieurs', players: [{ name: 'A', position: 'Milieu', team: 'Suisse' }, { id: 'keep', name: 'B', position: 'Gardien', team: 'Allemagne' }] }, { toTimestamp });
  const suisse = POTM_TEAMS.find((t) => t.name === 'Suisse');
  assert.deepEqual(national.players[0], { id: national.players[0].id, name: 'A', position: 'Milieu', team: 'Suisse', code: suisse.code, color: suisse.color, type: 'national', img: null, votes: 0 });
  assert.equal(national.players[1].id, 'keep');
  assert.equal(national.players[1].position, 'Gardien');
});

test('potm : même document que l\'ancien chemin de Form.jsx (PotmForm enrichit, Form.jsx enregistre)', () => {
  const save = buildPotmSaveData(SAMPLES.potm, { toTimestamp });
  const ids = save.players.map(({ id }) => id);
  const legacyPlayers = SAMPLES.potm.players.map((player, i) => {
    const team = POTM_TEAMS.find((t) => t.name === player.team);
    return {
      id: ids[i], name: player.name.trim(), position: potmPositionForCategory(player.position, 'Dames'), team: player.team,
      code: team.code || '', color: team.color || '#000000', type: team.type || 'national',
      img: team.type === 'national_league' ? team.img || null : null, votes: 0,
    };
  });
  const legacy = {
    type: 'potm',
    context: { context: 'national_league', category: 'Dames', text: 'Berne - Ajoie', date: toTimestamp(SAMPLES.potm.date) },
    players: legacyPlayers, brand: 'blick', theme: 'Sport', counterViews: 0,
  };
  assert.deepEqual(toDoc(save), toDoc(legacy));
});

// ---------- Faits marquants ----------

test('validateFacts : champs de chaque type, au plus une note du match, champs d\'un autre type refusés', () => {
  assert.deepEqual(validateFacts(SAMPLES.facts), []);
  assert.deepEqual(fields(validateFacts({ ...SAMPLES.facts, items: [] })), [['items', 'too_few']]);
  assert.deepEqual(fields(validateFacts({ theme: 'Sport' })), [['title', 'required'], ['date', 'required'], ['items', 'required']]);
  assert.deepEqual(fields(validateFacts({
    ...SAMPLES.facts,
    items: [
      { type: 'normal', icon: 'iconCheck', title: ' ', text: '<p><br></p>' },
      { type: 'quote', icon: 'iconQuote', title: 'Q', text: '<p></p>', author: '', picture: 'http://x/p.jpg' },
      { type: 'picture', icon: 'iconEye', title: 'P', text: 'ok', caption: '' },
      { type: 'number', icon: 'iconHashtag', title: 'N', value: '16', text: '' },
      { type: 'number', icon: 'iconHashtag', title: 'N', value: 1.5, text: 'ok' },
      { type: 'rating', title: 'Note ?' },
      { type: 'rating', title: 'Encore ?' },
      { type: 'rating', title: 'Et encore ?', icon: 'iconCross', text: 'non' },
      { type: 'sondage' },
      {},
      null,
    ],
  })), [
    ['items[0].icon', 'invalid_value'],
    ['items[0].title', 'required'],
    ['items[0].text', 'required'],
    ['items[1].text', 'required'],
    ['items[1].author', 'required'],
    ['items[1].picture', 'invalid_value'],
    ['items[2].src', 'required'],
    ['items[2].caption', 'required'],
    ['items[3].value', 'invalid_value'],
    ['items[3].text', 'required'],
    ['items[4].value', 'invalid_value'],
    ['items[6].type', 'too_many'],
    ['items[7].type', 'too_many'],
    ['items[7].icon', 'unknown_field'],
    ['items[7].text', 'unknown_field'],
    ['items[8].type', 'invalid_value'],
    ['items[9].type', 'required'],
    ['items[10]', 'invalid_type'],
  ]);
  // Champ d'un autre type : refusé s'il est renseigné, ignoré s'il est vide ; id conservable
  const normal = SAMPLES.facts.items[0];
  assert.deepEqual(fields(validateFacts({ ...SAMPLES.facts, items: [{ ...normal, src: 'https://x/y.webp', caption: '', value: null, id: 'k' }] })), [['items[0].src', 'unknown_field']]);
});

test('faits marquants : éléments comme Form.jsx (id, votes à 0, icône de la note), textes nettoyés', () => {
  const save = buildFactsSaveData(SAMPLES.facts, { toTimestamp });
  const doc = toDoc(save);
  const ids = doc.data.items.map(({ id }) => id);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(keys(doc.data), ['date', 'items', 'title']);
  assert.equal(doc.data.title, 'Ajoie - Lausanne');
  assert.deepEqual(doc.data.date, { iso: '2026-12-20T11:00:00.000Z' });
  assert.deepEqual(doc.stats, { views: 0, reveal: 0, ratingStats: {} });
  assert.equal(doc.meta.title, 'Ajoie - Lausanne');
  const [normal, quote, picture, number, rating] = doc.data.items;
  assert.deepEqual(normal, { id: ids[0], icon: 'iconCross', title: "L'action de la soirée", type: 'normal', text: '<p>Un <strong>but</strong> splendide</p>' });
  assert.deepEqual(quote, { id: ids[1], icon: 'iconQuote', title: 'La phrase', type: 'quote', text: 'On a tenu.<br><br>Bravo.', author: '– Geoff Ward', picture: 'https://cdn.example/ward.webp' });
  assert.deepEqual(picture, { id: ids[2], icon: 'iconEye', title: "L'image", type: 'picture', text: '<p>La joie</p>', caption: 'Photo: Getty Images', src: 'https://cdn.example/photo.webp' });
  assert.deepEqual(number, { id: ids[3], icon: 'iconHashtag', title: 'Le chiffre', type: 'number', text: 'minutes &lt;jouées&gt;', value: 16 });
  assert.deepEqual(rating, { id: ids[4], icon: FACTS_RATING_ICON, title: 'Et vous ?', type: 'rating', text: '' });
  // Le brouillon garde les votes à 0 (retirés par transformWidgetData, comme pour le dashboard)
  assert.ok(save.factsData.items.every((item) => item.votes === 0));
  // Citation sans personne détourée : pas de clé `picture`
  const bare = buildFactsSaveData({ ...SAMPLES.facts, items: [{ ...SAMPLES.facts.items[1], picture: '' }] }, { toTimestamp });
  assert.equal('picture' in bare.factsData.items[0], false);
  assert.equal('ratingStats' in bare, false);
  // Les champs stockés de chaque type sont ceux de FACTS_ITEM_FIELDS (hors icône de la note)
  for (const item of doc.data.items) {
    const expected = new Set(['id', 'icon', 'title', 'type', 'text', ...FACTS_ITEM_FIELDS[item.type]]);
    assert.deepEqual(keys(item), [...expected].sort(), item.type);
  }
});

test('faits marquants : même document que l\'ancien chemin de Form.jsx', () => {
  const save = buildFactsSaveData(SAMPLES.facts, { toTimestamp });
  const ids = save.factsData.items.map(({ id }) => id);
  const stored = save.factsData.items;
  // Form.jsx:894-913 sur la saisie déjà nettoyée par l'éditeur
  const legacyItems = stored.map((item) => {
    const base = { id: item.id, icon: item.icon || '', title: item.title || '', type: item.type || 'normal', text: item.text || '', votes: 0 };
    if (item.type === 'quote') { base.author = item.author || ''; if (item.picture) base.picture = item.picture; }
    if (item.type === 'picture') { base.caption = item.caption || ''; if (item.src) base.src = item.src; }
    if (item.type === 'number') base.value = item.value || 0;
    return base;
  });
  const legacy = {
    type: 'facts', brand: 'blick', theme: 'Sport', counterViews: 0,
    factsData: { rencontre: 'Ajoie - Lausanne', date: toTimestamp(SAMPLES.facts.date), items: legacyItems },
    ratingStats: {},
  };
  assert.deepEqual(stableIds(toDoc(save), ids), stableIds(toDoc(legacy), ids));
});

test('faits marquants (édition dashboard) : id et ratingStats existants conservés', () => {
  const save = buildFactsSaveData({ ...SAMPLES.facts, items: [{ ...SAMPLES.facts.items[4], id: 'r1' }], ratingStats: { 5: 3 } }, { toTimestamp });
  assert.equal(save.factsData.items[0].id, 'r1');
  assert.deepEqual(save.ratingStats, { 5: 3 });
});
