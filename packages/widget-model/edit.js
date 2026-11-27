// Modification d'un widget existant par l'API (specs/006-hub-edit), avec les règles du dashboard :
// le document stocké est relu au format de la requête de création (`widgetFormFromDoc`), la
// requête modifiée retrouve les ids stockés et ce que l'API ne publie pas (`widgetEditInput`),
// puis passe par les mêmes `validate*` / `build*SaveData` / `transformWidgetData` qu'une création ;
// les compteurs sont ceux du document relu, par id d'élément, comme les transactions d'édition de
// `apps/backend/src/components/Form/Form.jsx` (`widgetStatsOnEdit`).

import { isPlainObject, newId } from './common.js';
import { timestampToDate } from './dates.js';
import { WIDGET_EDIT_ID_LISTS } from './forms.js';
import { pollFormFromDoc, pollStatsOnEdit } from './poll.js';
import { calendarEditInput, calendarFormFromDoc, calendarStatsOnEdit } from './calendar.js';
import { tinderFormFromDoc, tinderStatsOnEdit } from './tinder.js';
import { quizFormFromDoc, quizStatsOnEdit } from './quiz.js';
import { teaserFormFromDoc, teaserStatsOnEdit } from './teaser.js';
import { folderFormFromDoc, folderStatsOnEdit } from './folder.js';
import { natinotesEditInput, natinotesFormFromDoc, natinotesStatsOnEdit } from './natinotes.js';
import { potmFormFromDoc, potmStatsOnEdit } from './potm.js';
import { factsFormFromDoc, factsStatsOnEdit } from './facts.js';
import { pronoEditInput, pronoFormFromDoc, pronoStatsOnEdit } from './prono.js';
import { testimonyFormFromDoc, testimonyStatsOnEdit } from './testimony.js';

const EDITS = {
  poll: { formFromDoc: pollFormFromDoc, statsOnEdit: pollStatsOnEdit },
  calendar: { formFromDoc: calendarFormFromDoc, statsOnEdit: calendarStatsOnEdit, editInput: calendarEditInput },
  tinder: { formFromDoc: tinderFormFromDoc, statsOnEdit: tinderStatsOnEdit },
  quiz: { formFromDoc: quizFormFromDoc, statsOnEdit: quizStatsOnEdit },
  teaser: { formFromDoc: teaserFormFromDoc, statsOnEdit: teaserStatsOnEdit },
  folder: { formFromDoc: folderFormFromDoc, statsOnEdit: folderStatsOnEdit },
  natinotes: { formFromDoc: natinotesFormFromDoc, statsOnEdit: natinotesStatsOnEdit, editInput: natinotesEditInput },
  potm: { formFromDoc: potmFormFromDoc, statsOnEdit: potmStatsOnEdit },
  facts: { formFromDoc: factsFormFromDoc, statsOnEdit: factsStatsOnEdit },
  prono: { formFromDoc: pronoFormFromDoc, statsOnEdit: pronoStatsOnEdit, editInput: pronoEditInput },
  testimony: { formFromDoc: testimonyFormFromDoc, statsOnEdit: testimonyStatsOnEdit },
};

const edits = (type) => {
  const rules = EDITS[type];
  if (!rules) throw new Error(`Format non modifiable : ${type}`);
  return rules;
};

/** Document `widgets` stocké → requête de création qui le reproduit (pré-remplissage), sans `author`. */
export const widgetFormFromDoc = (type, doc) => edits(type).formFromDoc(doc);

/**
 * Requête de modification (après traduction des dates) → entrée de `validate*` / `build*` :
 * - liste de `WIDGET_EDIT_ID_LISTS` : un id stocké est gardé (première occurrence) ; un id inconnu
 *   ou répété est retiré, l'élément est nouveau (`build` lui en donne un ; sondage : ici) ;
 * - ce que l'API ne publie pas est repris du document (options avancées des dates d'un calendrier,
 *   `label` NatiNotes, couleurs d'un pronostic).
 *
 * @param {string} type @param {object} input @param {object} current document stocké
 */
export function widgetEditInput(type, input, current) {
  const rules = edits(type);
  const key = WIDGET_EDIT_ID_LISTS[type];
  let next = input;
  if (key && Array.isArray(input[key])) {
    const known = new Set(rules.formFromDoc(current)[key].map((item) => item.id).filter(Boolean));
    next = {
      ...input,
      [key]: input[key].map((item) => {
        if (!isPlainObject(item)) return item;
        const { id, ...rest } = item;
        if (known.delete(id)) return { id, ...rest };
        return type === 'poll' ? { id: newId(), ...rest } : rest;
      }),
    };
  }
  return rules.editInput ? rules.editInput(next, current) : next;
}

/**
 * Compteurs du document modifié : ceux du document relu dans la transaction (`current`), par id
 * d'élément gardé ; élément retiré : son compteur disparaît ; nouvel élément : 0.
 *
 * @param {string} type @param {object} current document stocké @param {object} next document reconstruit
 */
export const widgetStatsOnEdit = (type, current, next) => edits(type).statsOnEdit(current, next);

/**
 * Version d'un document : `meta.timeUpdated` en ISO 8601 (chaîne vide s'il n'est pas lisible).
 * Toute modification du contenu la change ; les compteurs des lecteurs ne la touchent pas.
 */
export const widgetVersion = (doc) => timestampToDate(doc?.meta?.timeUpdated)?.toISOString() ?? '';
