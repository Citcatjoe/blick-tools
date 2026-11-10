// Règles métier du widget `poll`, communes au dashboard et à l'API.
// Valeurs admises relevées en production le 2026-11-09 (specs/001-poll-create-api/research.md R3).

export const POLL_BRANDS = Object.freeze(['blick', 'pme']);
export const POLL_THEMES = Object.freeze(['Suisse', 'Inter', 'Sport']);
export const DEFAULT_POLL_BRAND = 'blick';

const isMissing = (value) => value === undefined || value === null || value === '';

/**
 * Toutes les violations, dans l'ordre historique du dashboard (rubrique, question, réponses)
 * puis la marque. Le dashboard affiche la première, l'API les renvoie toutes.
 *
 * @param {{ theme?: unknown, question?: unknown, answers?: unknown, brand?: unknown }} input
 *   `answers` : `[{ id, text }]`
 * @returns {{ field: string, code: string, message: string }[]}
 */
export function validatePoll({ theme, question, answers, brand } = {}) {
  const errors = [];
  const fail = (field, code, message) => errors.push({ field, code, message });

  if (isMissing(theme)) {
    fail('theme', 'required', 'La rubrique est obligatoire.');
  } else if (!POLL_THEMES.includes(theme)) {
    fail('theme', 'invalid_value', `Rubrique inconnue (valeurs admises : ${POLL_THEMES.join(', ')}).`);
  }

  if (isMissing(question)) {
    fail('question', 'required', 'La question est obligatoire.');
  } else if (typeof question !== 'string') {
    fail('question', 'invalid_type', 'La question doit être une chaîne de caractères.');
  } else if (question.trim() === '') {
    fail('question', 'required', 'La question est obligatoire.');
  }

  if (isMissing(answers)) {
    fail('answers', 'required', 'Les réponses sont obligatoires.');
  } else if (!Array.isArray(answers)) {
    fail('answers', 'invalid_type', 'Les réponses doivent être une liste.');
  } else {
    if (answers.length < 2) {
      fail('answers', 'too_few', 'Au moins 2 réponses sont nécessaires.');
    }
    answers.forEach((answer, index) => {
      const text = answer?.text;
      if (text !== undefined && text !== null && typeof text !== 'string') {
        fail(`answers[${index}]`, 'invalid_type', `La réponse ${index + 1} doit être une chaîne de caractères.`);
      } else if (!text || text.trim() === '') {
        fail(`answers[${index}]`, 'required', `La réponse ${index + 1} est vide.`);
      }
    });
  }

  if (!isMissing(brand) && !POLL_BRANDS.includes(brand)) {
    fail('brand', 'invalid_value', `Marque inconnue (valeurs admises : ${POLL_BRANDS.join(', ')}).`);
  }

  return errors;
}

/**
 * Règles d'une édition partielle : `question`, `theme`, `brand` et/ou `answers` fournis
 * optionnellement. Ne vérifie que la forme et le contenu fournis ; la correspondance des ids
 * avec le document existant est du ressort de l'écrivain, seul à connaître les ids stockés.
 *
 * @param {{ question?: unknown, answers?: unknown, theme?: unknown, brand?: unknown }} input
 *   `answers` : `[{ id?, text }]` — `id` absent = nouvelle réponse (id généré par l'écrivain).
 * @returns {{ field: string, code: string, message: string }[]}
 */
export function validatePollEdits({ question, answers, theme, brand } = {}) {
  const errors = [];
  const fail = (field, code, message) => errors.push({ field, code, message });

  if (question !== undefined && question !== null) {
    if (typeof question !== 'string') {
      fail('question', 'invalid_type', 'La question doit être une chaîne de caractères.');
    } else if (question.trim() === '') {
      fail('question', 'required', 'La question est obligatoire.');
    }
  }

  if (theme !== undefined && theme !== null) {
    if (!POLL_THEMES.includes(theme)) {
      fail('theme', 'invalid_value', `Rubrique inconnue (valeurs admises : ${POLL_THEMES.join(', ')}).`);
    }
  }

  if (brand !== undefined && brand !== null) {
    if (!POLL_BRANDS.includes(brand)) {
      fail('brand', 'invalid_value', `Marque inconnue (valeurs admises : ${POLL_BRANDS.join(', ')}).`);
    }
  }

  if (answers !== undefined && answers !== null) {
    if (!Array.isArray(answers)) {
      fail('answers', 'invalid_type', 'Les réponses doivent être une liste.');
    } else {
      if (answers.length < 2) {
        fail('answers', 'too_few', 'Au moins 2 réponses sont nécessaires.');
      }
      answers.forEach((answer, index) => {
        if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
          fail(`answers[${index}]`, 'invalid_type', `La réponse ${index + 1} doit être un objet { id?, text }.`);
          return;
        }
        if (answer.id !== undefined && answer.id !== null && (typeof answer.id !== 'string' || answer.id === '')) {
          fail(`answers[${index}]`, 'invalid_value', `La réponse ${index + 1} porte un identifiant invalide.`);
        }
        if (typeof answer.text !== 'string') {
          fail(`answers[${index}]`, 'invalid_type', `La réponse ${index + 1} doit être une chaîne de caractères.`);
        } else if (answer.text.trim() === '') {
          fail(`answers[${index}]`, 'required', `La réponse ${index + 1} est vide.`);
        }
      });
    }
  }

  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`. Précondition : `validatePoll(input)`
 * est vide. Textes rognés ; un compteur par id de réponse (repris de `answerCounters`, sinon 0).
 *
 * @param {{ question: string, answers: { id: string, text: string }[],
 *   answerCounters?: Record<string, number>, brand?: string, theme: string }} input
 */
export function buildPollSaveData({ question, answers, answerCounters, brand, theme }) {
  const answerTxts = answers.map(({ id, text }) => ({ id, text: text.trim() }));
  return {
    type: 'poll',
    pollTxt: question.trim(),
    answerTxts,
    answerCounters: Object.fromEntries(answerTxts.map(({ id }) => [id, answerCounters?.[id] || 0])),
    brand: brand || DEFAULT_POLL_BRAND,
    theme,
  };
}
