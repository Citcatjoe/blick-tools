// Règles et construction du widget `calendar`, communes au dashboard et à l'API.
// Les options avancées des dates (fin, badge, lien live) sont masquées dans le dashboard
// (`SHOW_ADVANCED_DATE_OPTIONS = false`) et absentes de l'API : elles ne sont que conservées
// telles quelles quand le dashboard réenregistre un calendrier qui les porte déjà.

import {
  BLICK_ONLY_BRANDS, DEFAULT_BRAND, checkBrand, checkOptionalText, checkText, checkTheme, errorCollector, formCommon, isBlank, isMissing,
  isPlainObject, optionalText, statsOnEdit, trimOrEmpty, withoutUndefined,
} from './common.js';
import { formatDateTime, timestampToDate } from './dates.js';

export const CALENDAR_ALL_ELEMENTS = 100; // « Tous » dans le menu du dashboard
export const CALENDAR_MAX_ELEMENTS_CHOICE = 10;

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Toutes les violations, dans l'ordre du dashboard (rubrique, titre, dates, lien global) puis la
 * marque.
 *
 * @param {{ theme?: unknown, title?: unknown, dates?: unknown, nbElemsToShow?: unknown,
 *   linkGlobal?: { text?: unknown, href?: unknown, newTab?: unknown }, brand?: unknown }} input
 *   `dates` : `[{ text, complement?, start: Date, end?: Date | null, showBadge?: boolean,
 *   liveLinkEnabled?: boolean, liveLinkUrl?: string }]` — chaque écrivain convertit sa saisie en
 *   `Date`.
 */
export function validateCalendar({ theme, title, dates, nbElemsToShow, linkGlobal, brand } = {}) {
  const { errors, fail } = errorCollector();

  checkTheme(theme, fail);
  checkText(title, 'title', 'Le titre du calendrier', fail);

  if (isMissing(dates)) {
    fail('dates', 'required', 'Au moins une date est nécessaire.');
  } else if (!Array.isArray(dates)) {
    fail('dates', 'invalid_type', 'Les dates doivent être une liste.');
  } else if (dates.length === 0) {
    fail('dates', 'too_few', 'Au moins une date est nécessaire.');
  } else {
    dates.forEach((date, index) => {
      if (!date || typeof date !== 'object' || Array.isArray(date)) {
        fail(`dates[${index}]`, 'invalid_type', `La date ${index + 1} doit être un objet.`);
        return;
      }
      checkText(date.text, `dates[${index}].text`, `Le libellé de la date ${index + 1}`, fail);
      checkOptionalText(date.complement, `dates[${index}].complement`, `Le complément de la date ${index + 1}`, fail);
      if (isMissing(date.start)) {
        fail(`dates[${index}].start`, 'required', `La date ${index + 1} doit avoir un début.`);
      } else if (!isValidDate(date.start)) {
        fail(`dates[${index}].start`, 'invalid_value', `Le début de la date ${index + 1} est invalide.`);
      }
      if (!isMissing(date.end) && !isValidDate(date.end)) {
        fail(`dates[${index}].end`, 'invalid_value', `La fin de la date ${index + 1} est invalide.`);
      }
      for (const flag of ['showBadge', 'liveLinkEnabled']) {
        if (!isMissing(date[flag]) && typeof date[flag] !== 'boolean') {
          fail(`dates[${index}].${flag}`, 'invalid_type', `« ${flag} » de la date ${index + 1} doit être un booléen.`);
        }
      }
      checkOptionalText(date.liveLinkUrl, `dates[${index}].liveLinkUrl`, `Le lien live de la date ${index + 1}`, fail);
    });
  }

  if (!isMissing(nbElemsToShow)) {
    if (!Number.isInteger(nbElemsToShow) || nbElemsToShow < 1 || nbElemsToShow > CALENDAR_MAX_ELEMENTS_CHOICE) {
      fail('nbElemsToShow', 'invalid_value', `Le nombre d'éléments affichés doit être compris entre 1 et ${CALENDAR_MAX_ELEMENTS_CHOICE} (absent = tous).`);
    }
  }

  if (!isMissing(linkGlobal)) {
    if (typeof linkGlobal !== 'object' || Array.isArray(linkGlobal)) {
      fail('linkGlobal', 'invalid_type', 'Le lien global doit être un objet { text, href }.');
    } else {
      const hasText = !isBlank(linkGlobal.text);
      const hasHref = !isBlank(linkGlobal.href);
      if (hasText && !hasHref) {
        fail('linkGlobal.href', 'required', "L'URL du lien global est obligatoire avec son texte.");
      } else if (!hasText && hasHref) {
        fail('linkGlobal.text', 'required', 'Le texte du lien global est obligatoire avec son URL.');
      } else if (hasHref && !/^https?:\/\//i.test(linkGlobal.href.trim())) {
        fail('linkGlobal.href', 'invalid_value', "L'URL du lien global doit commencer par http:// ou https://.");
      }
      if (!isMissing(linkGlobal.newTab) && typeof linkGlobal.newTab !== 'boolean') {
        fail('linkGlobal.newTab', 'invalid_type', "L'ouverture dans un nouvel onglet doit être un booléen.");
      }
    }
  }

  checkBrand(brand, BLICK_ONLY_BRANDS, fail);
  return errors;
}

/**
 * Enregistrement plat consommé par `transformWidgetData`. Précondition : `validateCalendar` vide.
 *
 * @param {object} input voir `validateCalendar`
 * @param {{ toTimestamp: (date: Date) => unknown }} deps horodatage du SDK de l'écrivain
 */
export function buildCalendarSaveData({ title, dates, nbElemsToShow, linkGlobal, brand, theme }, { toTimestamp }) {
  const name = title.trim();
  const hasLink = linkGlobal && !isBlank(linkGlobal.text) && !isBlank(linkGlobal.href);
  return {
    type: 'calendar',
    calName: name,
    calWording: name,
    nbElemsToShow: isMissing(nbElemsToShow) ? CALENDAR_ALL_ELEMENTS : nbElemsToShow,
    dates: dates.map((date) => ({
      // Id d'une date qui en porte déjà un (modification par l'API) ; jamais créé.
      ...(isMissing(date.id) ? {} : { id: date.id }),
      text: date.text.trim(),
      complement: trimOrEmpty(date.complement),
      scheduleStart: toTimestamp(date.start),
      scheduleEnd: isMissing(date.end) ? null : toTimestamp(date.end),
      showBadge: date.showBadge === true,
      liveLinkExists: date.liveLinkEnabled === true,
      liveLinkUrl: date.liveLinkEnabled === true ? trimOrEmpty(date.liveLinkUrl) : '',
    })),
    linkGlobalTxt: hasLink ? linkGlobal.text.trim() : '',
    linkGlobalHref: hasLink ? linkGlobal.href.trim() : '',
    linkGlobalNewTab: hasLink ? linkGlobal.newTab === true : false,
    brand: brand || DEFAULT_BRAND,
    theme,
  };
}

/**
 * Document stocké → requête de modification (`PUT /calendars/{id}`). `start` en heure suisse ;
 * `id` seulement pour une date qui en a un ; `nbElemsToShow` absent pour « Toutes » ; `linkGlobal`
 * absent sans lien.
 */
export function calendarFormFromDoc(doc) {
  const data = doc?.data ?? {};
  const nb = data.nbElemsToShow;
  return withoutUndefined({
    title: data.title ?? '',
    dates: (data.dates ?? []).map((date) => withoutUndefined({
      id: optionalText(date?.id),
      text: date?.text ?? '',
      start: formatStart(date?.scheduleStart),
      complement: optionalText(date?.complement),
    })),
    nbElemsToShow: Number.isInteger(nb) && nb >= 1 && nb <= CALENDAR_MAX_ELEMENTS_CHOICE ? nb : undefined,
    linkGlobal: isBlank(data.linkGlobalHref)
      ? undefined
      : { text: data.linkGlobalTxt ?? '', href: data.linkGlobalHref, newTab: data.linkGlobalNewTab === true },
    ...formCommon(doc),
  });
}

const formatStart = (timestamp) => {
  const date = timestampToDate(timestamp);
  return date ? formatDateTime(date) : undefined;
};

/**
 * Requête de modification complétée de ce que l'API ne publie pas : options avancées (fin, badge,
 * lien live) des dates gardées, retrouvées par id.
 */
export function calendarEditInput(input, current) {
  if (!Array.isArray(input.dates)) return input;
  const stored = new Map((current?.data?.dates ?? []).filter((date) => !isMissing(date?.id)).map((date) => [date.id, date]));
  return {
    ...input,
    dates: input.dates.map((date) => {
      const previous = isPlainObject(date) ? stored.get(date.id) : undefined;
      if (!previous) return date;
      return {
        ...date,
        end: timestampToDate(previous.scheduleEnd),
        showBadge: previous.showBadge === true,
        liveLinkEnabled: previous.liveLinkExists === true,
        liveLinkUrl: typeof previous.liveLinkUrl === 'string' ? previous.liveLinkUrl : '',
      };
    }),
  };
}

/** Compteurs après modification : ceux du document (vues, « tout voir »), comme le dashboard. */
export const calendarStatsOnEdit = (current, next) => statsOnEdit(current, next);
