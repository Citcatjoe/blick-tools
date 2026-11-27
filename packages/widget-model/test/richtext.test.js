import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRichText, escapeHtmlText } from '../index.js';

const LINK = (href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">`;

test('sanitizeRichText : garde paragraphes, retours, gras, italique ; <b>/<i> deviennent <strong>/<em>', () => {
  assert.equal(sanitizeRichText('<p>Un <strong>but</strong> <em>superbe</em><br>Deux</p>'), '<p>Un <strong>but</strong> <em>superbe</em><br>Deux</p>');
  assert.equal(sanitizeRichText('<P>Un <B>but</B> <i>net</i></P>'), '<p>Un <strong>but</strong> <em>net</em></p>');
});

test('sanitizeRichText : liens http(s) seulement, ouverts dans un nouvel onglet, autres attributs retirés', () => {
  assert.equal(sanitizeRichText('<a href="https://blick.ch/a?x=1&amp;y=2" class="c" onclick="alert(1)">lien</a>'), `${LINK('https://blick.ch/a?x=1&amp;y=2')}lien</a>`);
  assert.equal(sanitizeRichText("<a target=_self href='http://blick.ch'>x</a>"), `${LINK('http://blick.ch')}x</a>`);
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java&#x09;script:alert(1)', 'data:text/html,<b>', '/relatif', 'mailto:a@b.ch']) {
    assert.equal(sanitizeRichText(`<a href="${href}">x</a>`), 'x', href);
  }
  assert.equal(sanitizeRichText('<a>sans adresse</a>'), 'sans adresse');
});

test('sanitizeRichText : script, style et iframe retirés avec leur contenu ; autres balises et attributs retirés', () => {
  assert.equal(sanitizeRichText('<p>a<script>alert(1)</script>b</p>'), '<p>ab</p>');
  assert.equal(sanitizeRichText('<style>p{}</style><iframe src="https://x"></iframe>ok'), 'ok');
  assert.equal(sanitizeRichText('<p style="color:red" onmouseover="x()">a</p>'), '<p>a</p>');
  assert.equal(sanitizeRichText('<img src=x onerror=alert(1)><div><span>texte</span></div>'), 'texte');
  assert.equal(sanitizeRichText('<svg onload=alert(1)><text>x</text></svg>y'), 'y');
  assert.equal(sanitizeRichText('a<!-- commentaire -->b'), 'ab');
});

test('sanitizeRichText : texte échappé, entités existantes gardées, balises refermées', () => {
  assert.equal(sanitizeRichText('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
  assert.equal(sanitizeRichText('A&amp;B &lt;tag&gt; &#39;x&#39;'), 'A&amp;B &lt;tag&gt; &#39;x&#39;');
  assert.equal(sanitizeRichText('a&nbsp;b'), 'a b');
  assert.equal(sanitizeRichText('<p><strong>gras'), '<p><strong>gras</strong></p>');
  assert.equal(sanitizeRichText('fin</em></p>'), 'fin');
});

test('sanitizeRichText : vide après nettoyage → chaîne vide', () => {
  for (const empty of ['', '   ', '<p><br></p>', '<p></p>', '<p>&nbsp;</p>', '<script>x</script>', '<a href="javascript:x"></a>', null, undefined, 42]) {
    assert.equal(sanitizeRichText(empty), '', String(empty));
  }
});

test('sanitizeRichText inline : paragraphes remplacés par <br><br>, sans <p>', () => {
  assert.equal(sanitizeRichText('<p>Un</p><p>Deux <b>trois</b></p>', { inline: true }), 'Un<br><br>Deux <strong>trois</strong>');
  assert.equal(sanitizeRichText('<p>Seul</p>', { inline: true }), 'Seul');
  assert.equal(sanitizeRichText('<p><br></p>', { inline: true }), '');
});

test('sanitizeRichText : idempotent (réenregistrer un texte ne le change pas)', () => {
  const inputs = [
    '<p>A &amp; B <b>gras</b> <a href="https://x.ch/?a=1&b=2">lien</a></p><p>1 < 2</p>',
    'Texte simple & <rien>',
    "<p>l'été</p><p>&lt;b&gt;</p>",
  ];
  for (const html of inputs) {
    for (const inline of [false, true]) {
      const once = sanitizeRichText(html, { inline });
      assert.equal(sanitizeRichText(once, { inline }), once, html);
    }
  }
});

test('escapeHtmlText : échappe < > & sans réescaper les entités', () => {
  assert.equal(escapeHtmlText('a < b & c'), 'a &lt; b &amp; c');
  assert.equal(escapeHtmlText(escapeHtmlText('a < b & c')), 'a &lt; b &amp; c');
});
