// Texte enrichi des widgets (contenus des faits marquants, paragraphes des notes des joueurs) :
// les apps clientes l'affichent tel quel (`dangerouslySetInnerHTML`), il est donc nettoyé avant
// écriture, par le dashboard comme par l'API. Même résultat que l'éditeur du dashboard
// (RichTextEditor.jsx : gras, italique, lien ; liens ouverts dans un nouvel onglet ; `&nbsp;`
// remplacés ; paragraphes remplacés par `<br><br>` en mode « inline »). Sans dépendance.

import { isMissing } from './common.js';

/** Balises conservées (après conversion `<b>` → `<strong>`, `<i>` → `<em>`). */
export const RICHTEXT_TAGS = Object.freeze(['p', 'br', 'strong', 'em', 'a']);

const RENAMED = { b: 'strong', i: 'em' };
// Balises retirées avec tout leur contenu (code, styles, objets embarqués).
const DROPPED_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'textarea', 'select', 'svg', 'math', 'head', 'title']);

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const HREF = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Échappe un texte simple destiné à un affichage HTML (`<`, `>`, `&` hors entité existante :
 * réenregistrer un texte déjà échappé ne le change pas).
 */
export const escapeHtmlText = (text) => text
  .replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttribute = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const decodeEntities = (value) => value
  .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/** Adresse de lien admise : http(s) absolue, sans caractère de contrôle. */
function safeHref(raw) {
  // Les navigateurs ignorent les caractères de contrôle dans une adresse (« java\tscript: ») : retirés avant contrôle.
  // eslint-disable-next-line no-control-regex
  const value = decodeEntities(raw).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Texte visible d'un HTML nettoyé (balises retirées, espaces insécables compris). */
const visibleText = (html) => decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\u00A0/g, ' ').trim();

/**
 * Nettoie un HTML de saisie : garde `<p>`, `<br>`, `<strong>`, `<em>` et `<a href="http(s)…">`
 * (avec `target="_blank" rel="noopener noreferrer"`), sans autre attribut. Les autres balises sont
 * retirées (leur texte reste, sauf script, style, iframe… retirés avec leur contenu) ; le texte
 * est échappé. Un contenu sans texte visible (`<p><br></p>`) donne ''.
 *
 * @param {unknown} html
 * @param {{ inline?: boolean }} [options] `inline` : pas de paragraphes, `<br><br>` entre eux
 * @returns {string}
 */
export function sanitizeRichText(html, { inline = false } = {}) {
  if (typeof html !== 'string') return '';
  const source = html.replace(/&nbsp;|\u00A0/g, ' ');
  const out = [];
  const open = []; // balises ouvertes émises, pour refermer proprement
  let skipUntil = null; // balise dont on ignore le contenu jusqu'à sa fermeture
  let last = 0;

  const emitText = (text) => {
    if (!skipUntil && text) out.push(escapeHtmlText(text));
  };
  const close = (tag) => {
    const at = open.lastIndexOf(tag);
    if (at === -1) return;
    while (open.length > at) out.push(`</${open.pop()}>`);
  };

  for (const match of source.matchAll(TOKEN)) {
    emitText(source.slice(last, match.index));
    last = match.index + match[0].length;
    const [, slash, rawName, attributes] = match;
    if (!rawName) continue; // commentaire
    const name = rawName.toLowerCase();
    const closing = slash === '/';

    if (skipUntil) {
      if (closing && name === skipUntil) skipUntil = null;
      continue;
    }
    if (DROPPED_WITH_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/.test(attributes)) skipUntil = name;
      continue;
    }

    const tag = RENAMED[name] ?? name;
    if (!RICHTEXT_TAGS.includes(tag)) continue;
    if (tag === 'br') {
      if (!closing) out.push('<br>');
      continue;
    }
    if (closing) {
      close(tag);
      continue;
    }
    if (tag === 'p') close('p'); // pas de paragraphe imbriqué
    if (tag === 'a') {
      const found = HREF.exec(attributes);
      const href = found ? safeHref(found[1] ?? found[2] ?? found[3]) : null;
      if (!href) continue; // lien refusé : seul son texte reste
      close('a');
      out.push(`<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`);
    } else {
      out.push(`<${tag}>`);
    }
    open.push(tag);
  }
  emitText(source.slice(last));
  while (open.length) out.push(`</${open.pop()}>`);

  let result = out.join('');
  if (inline) {
    result = result.replace(/<\/p>\s*<p>/g, '<br><br>').replace(/<\/?p>/g, '');
  }
  result = result.trim();
  return visibleText(result) === '' ? '' : result;
}

/** Texte enrichi obligatoire : `required` s'il est absent ou vide après nettoyage. */
export function checkRichText(value, field, label, inline, fail) {
  if (isMissing(value)) {
    fail(field, 'required', `${label} est obligatoire.`);
  } else if (typeof value !== 'string') {
    fail(field, 'invalid_type', `${label} doit être une chaîne de caractères.`);
  } else if (sanitizeRichText(value, { inline }) === '') {
    fail(field, 'required', `${label} est obligatoire.`);
  }
}
