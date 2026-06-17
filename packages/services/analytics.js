import { db } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';

/**
 * Envoie un événement au dataLayer pour indiquer qu'une vue a été chargée.
 */
export function dataLayerPushView(docId, widgetName = 'WIDGET') {
  const iframeId = `storytelling_${widgetName}_${docId}`;
  if (window.blickDataLayer) {
    window.blickDataLayer.push({
      event: 'iframe_impression',
      iframe_name: iframeId,
      iframe_id: 'iframe_impression',
    });
  }
}

/**
 * Envoie un événement 'see all click'
 */
export function dataLayerPushSeeAllClick(docId, widgetName = 'WIDGET') {
  const iframeId = `storytelling_${widgetName}_${docId}`;
  if (window.blickDataLayer) {
    window.blickDataLayer.push({
      event: 'iframe_see_all_click',
      iframe_name: iframeId,
      iframe_id: 'iframe_see_all_click',
    });
  }
}

/**
 * Envoie un événement 'link global click'
 */
export function dataLayerPushLinkGlobalClick(docId, widgetName = 'WIDGET') {
  const iframeId = `storytelling_${widgetName}_${docId}`;
  if (window.blickDataLayer) {
    window.blickDataLayer.push({
      event: 'iframe_global_link_click',
      iframe_name: iframeId,
      iframe_id: 'iframe_global_link_click',
    });
  }
}

/**
 * Incrémente le compteur de vues dans Firebase pour un document donné de manière atomique.
 */
export async function incrementCounterViews(docId) {
  const ref = doc(db, 'embeds', docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(ref);
      if (!docSnap.exists()) return;
      const current = docSnap.data().counterViews || 0;
      transaction.update(ref, { counterViews: current + 1 });
    });
  } catch (e) {
    console.error('Erreur incrémentation counterViews:', e);
  }
}

/**
 * Incrémente le compteur de reveal dans Firebase pour un document donné de manière atomique.
 */
export async function incrementCounterReveal(docId) {
  const ref = doc(db, 'embeds', docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(ref);
      if (!docSnap.exists()) return;
      const current = docSnap.data().counterReveal || 0;
      transaction.update(ref, { counterReveal: current + 1 });
    });
  } catch (e) {
    console.error('Erreur incrémentation counterReveal:', e);
  }
}
