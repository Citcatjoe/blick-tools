// Entrées valides des formats ouverts par la spec 005 (requête après `parse` de l'API : dates en
// `Date`), partagées par les tests des règles et ceux de la description.

export const TEAMS = [
  {
    id: 'suisse',
    name: 'Suisse',
    players: [
      { id: 'granit-xhaka', name: 'Granit Xhaka', img: 'https://cdn.example/xhaka.webp', focal: { x: 40, y: 10, zoom: 1.5 } },
      { id: 'breel-embolo', name: 'Breel Embolo', team: 'Suisse M21' },
      { id: 'yann-sommer', name: 'Yann Sommer', archived: true },
    ],
  },
  {
    id: 'france',
    name: 'France',
    players: [{ id: 'kylian-mbappe', name: 'Kylian Mbappé', img: null, focal: { x: 120, y: -5, zoom: 0 } }],
  },
];

export const SAMPLES = {
  teaser: {
    theme: 'Inter',
    label: ' Groenland ',
    title: 'Ce pays que Trump\nveut prendre par la force ',
    img: 'https://firebasestorage.googleapis.com/v0/b/x/o/teasers%2Fa.webp?alt=media',
    button: { text: " Vers l'article ", href: ' https://www.blick.ch/fr/monde ' },
  },
  folder: {
    theme: 'Sport',
    label: 'JO',
    labelColor: 'sport',
    name: 'Ne manquez rien\ndes Jeux Olympiques',
    img: 'https://cdn.example/folder.webp',
    buttons: [
      { text: 'Résultats', href: 'https://www.blick.ch/fr/sport/jo' },
      { text: 'Médailles', href: 'http://www.blick.ch/fr/sport/medailles', newTab: true },
    ],
  },
  natinotes: {
    theme: 'Sport',
    title: ' Notes du match Suisse - France ',
    players: [
      { id: 'granit-xhaka', blickRating: 5, comment: '<p>Patron du <b>milieu</b>.</p>' },
      { id: 'kylian-mbappe', blickRating: 4, comment: 'Discret & efficace' },
    ],
  },
  potm: {
    theme: 'Sport',
    context: 'national_league',
    category: 'Dames',
    text: ' Berne - Ajoie ',
    date: new Date('2026-12-20T11:00:00Z'),
    players: [
      { name: ' Alina Müller ', position: 'Attaquant', team: 'Berne' },
      { name: 'Lara Stalder', position: 'Défenseur', team: 'Ajoie' },
      { name: 'Andrea Brändli', position: 'Gardien', team: 'Berne' },
      { name: 'Colin Muller', position: 'Entraîneur', team: 'Berne' },
    ],
  },
  facts: {
    theme: 'Sport',
    title: ' Ajoie - Lausanne ',
    date: new Date('2026-12-20T11:00:00Z'),
    items: [
      { type: 'normal', icon: 'iconCross', title: "L'action de la soirée", text: '<p>Un <b>but</b> splendide</p>' },
      { type: 'quote', icon: 'iconQuote', title: 'La phrase', text: '<p>On a tenu.</p><p>Bravo.</p>', author: '– Geoff Ward', picture: 'https://cdn.example/ward.webp' },
      { type: 'picture', icon: 'iconEye', title: "L'image", src: 'https://cdn.example/photo.webp', text: '<p>La joie</p>', caption: 'Photo: Getty Images' },
      { type: 'number', icon: 'iconHashtag', title: 'Le chiffre', value: 16, text: 'minutes <jouées>' },
      { type: 'rating', title: 'Et vous ?' },
    ],
  },
  prono: {
    theme: 'Sport',
    event: 'Coupe du monde UEFA 2026',
    date: new Date('2026-06-15T10:00:00Z'),
    team1: 'Suisse',
    team2: 'Canada',
  },
  testimony: {
    theme: 'Suisse',
    title: ' Votre avis nous intéresse ',
    subject: ' Hausse des primes maladie ',
    question: ' Comment faites-vous face\nà la hausse de vos primes ? ',
    timeExpires: new Date('2026-12-20T19:45:00Z'),
  },
};

export const TS = { sentinel: 'serverTimestamp' };
export const serverTimestamp = () => TS;
export const toTimestamp = (date) => ({ iso: date.toISOString() });
export const fields = (errors) => errors.map(({ field, code }) => [field, code]);
export const clone = (value) => structuredClone(value);
