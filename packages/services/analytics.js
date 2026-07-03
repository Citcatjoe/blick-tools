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
  try {
    await runTransaction(db, async (transaction) => {
      const widgetRef = doc(db, 'widgets', docId);
      const widgetSnap = await transaction.get(widgetRef);
      if (widgetSnap.exists()) {
        const stats = widgetSnap.data().stats || {};
        const current = stats.views || 0;
        transaction.update(widgetRef, { 'stats.views': current + 1 });
      }
    });
  } catch (e) {
    console.error('Erreur incrémentation views:', e);
  }
}

/**
 * Incrémente le compteur de reveal dans Firebase pour un document donné de manière atomique.
 */
export async function incrementCounterReveal(docId) {
  try {
    await runTransaction(db, async (transaction) => {
      const widgetRef = doc(db, 'widgets', docId);
      const widgetSnap = await transaction.get(widgetRef);
      if (widgetSnap.exists()) {
        const stats = widgetSnap.data().stats || {};
        const current = stats.reveal || 0;
        transaction.update(widgetRef, { 'stats.reveal': current + 1 });
      }
    });
  } catch (e) {
    console.error('Erreur incrémentation reveal:', e);
  }
}
