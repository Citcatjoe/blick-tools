// Règles et construction du widget `quiz`, communes au dashboard et à l'API.
// Compteurs par id de question (constitution, principe II) : la création produit toujours
// `statsQuestions[questionId]` et une distribution de scores 0..n (specs/002 research R3).

import { BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkOptionalText, checkText, checkTheme, errorCollector, isMissing, newId, trimOrEmpty } from './common.js';

export const QUIZ_ANSWERS_PER_QUESTION = 4;
export const QUIZ_CONCLUSION_KEYS = Object.freeze(['text1', 'text2', 'text3']);
const CONCLUSION_RANGES = { text1: '0–33 %', text2: '34–66 %', text3: '67–100 %' };

/**
 * Toutes les violations, dans l'ordre du dashboard (rubrique, titre, questions, conclusions) puis
 * la marque. Par question : texte, nombre de réponses, textes des réponses, bonne réponse.
 *
 * @param {{ theme?: unknown, title?: unknown, questions?: unknown, conclusion?: unknown,
 *   brand?: unknown }} input
 *   `questions` : `[{ id?, text, hint?, img?, hidePercent?, answers: [{ text, isCorrect? }] }]`
 */
export function validateQuiz({ theme, title, questions, conclusion, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(title, 'title', 'Le titre du quiz', fail);

  if (isMissing(questions)) {
    fail('questions', 'required', 'Au moins une question est nécessaire.');
  } else if (!Array.isArray(questions)) {
    fail('questions', 'invalid_type', 'Les questions doivent être une liste.');
  } else if (questions.length === 0) {
    fail('questions', 'too_few', 'Au moins une question est nécessaire.');
  } else {
    questions.forEach((question, index) => {
      const at = `questions[${index}]`;
      const n = index + 1;
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        fail(at, 'invalid_type', `La question ${n} doit être un objet.`);
        return;
      }
      checkText(question.text, `${at}.text`, `Le texte de la question ${n}`, fail);
      checkOptionalText(question.hint, `${at}.hint`, `L'indice de la question ${n}`, fail);
      checkImageUrl(question.img, `${at}.img`, n, fail);
      if (!isMissing(question.hidePercent) && typeof question.hidePercent !== 'boolean') {
        fail(`${at}.hidePercent`, 'invalid_type', `Le masquage des pourcentages de la question ${n} doit être un booléen.`);
      }

      const { answers } = question;
      if (!Array.isArray(answers) || answers.length !== QUIZ_ANSWERS_PER_QUESTION) {
        fail(`${at}.answers`, 'invalid_value', `La question ${n} doit avoir exactement ${QUIZ_ANSWERS_PER_QUESTION} réponses.`);
        return;
      }
      answers.forEach((answer, answerIndex) => {
        checkText(answer?.text, `${at}.answers[${answerIndex}].text`, `La réponse ${answerIndex + 1} de la question ${n}`, fail);
        if (answer && !isMissing(answer.isCorrect) && typeof answer.isCorrect !== 'boolean') {
          fail(`${at}.answers[${answerIndex}].isCorrect`, 'invalid_type', `« isCorrect » de la réponse ${answerIndex + 1} de la question ${n} doit être un booléen.`);
        }
      });
      const correctCount = answers.filter((answer) => answer?.isCorrect === true).length;
      if (correctCount !== 1) {
        fail(`${at}.correctAnswer`, 'invalid_value', `La question ${n} doit avoir exactement une bonne réponse.`);
      }
    });
  }

  if (!conclusion || typeof conclusion !== 'object' || Array.isArray(conclusion)) {
    QUIZ_CONCLUSION_KEYS.forEach((key) => fail(`conclusion.${key}`, 'required', `La conclusion pour un score de ${CONCLUSION_RANGES[key]} est obligatoire.`));
  } else {
    QUIZ_CONCLUSION_KEYS.forEach((key) => checkText(conclusion[key], `conclusion.${key}`, `La conclusion pour un score de ${CONCLUSION_RANGES[key]}`, fail));
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

// Image : absente, ou URL https (le dashboard ne produit que des URL de son Firebase Storage,
// l'API importe toute image https puis la remplace par sa copie dans ce même Storage).
function checkImageUrl(img, field, n, fail) {
  if (isMissing(img)) return;
  let ok = false;
  try {
    ok = typeof img === 'string' && new URL(img).protocol === 'https:';
  } catch { /* URL invalide */ }
  if (!ok) fail(field, 'invalid_value', `L'image de la question ${n} doit être une URL https.`);
}

/**
 * Enregistrement plat consommé par `transformWidgetData`. Précondition : `validateQuiz` vide.
 * Chaque question reçoit un id si elle n'en a pas ; compteurs à zéro par id et distribution des
 * scores 0..n. En édition, le dashboard fusionne ensuite les compteurs existants (transaction).
 */
export function buildQuizSaveData({ title, questions, conclusion, brand, theme }) {
  const savedQuestions = questions.map((question) => ({
    id: question.id || newId(),
    text: question.text.trim(),
    hint: trimOrEmpty(question.hint),
    img: typeof question.img === 'string' ? question.img : '',
    hidePercent: question.hidePercent === true,
    answers: question.answers.map((answer) => ({ isCorrect: answer.isCorrect === true, text: answer.text.trim() })),
  }));
  const scoreDistribution = {};
  for (let score = 0; score <= savedQuestions.length; score++) scoreDistribution[score] = 0;
  return {
    type: 'quiz',
    title: title.trim(),
    questions: savedQuestions,
    conclusion: Object.fromEntries(QUIZ_CONCLUSION_KEYS.map((key) => [key, conclusion[key].trim()])),
    statsQuestions: Object.fromEntries(savedQuestions.map(({ id }) => [id, { correct: 0, incorrect: 0 }])),
    statsGlobal: { scoreDistribution },
    brand: brand || DEFAULT_BRAND,
    theme,
  };
}
