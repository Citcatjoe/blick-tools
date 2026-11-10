// Adaptateur « formulaire plat → document `widgets` 4 blocs », partagé par tous les écrivains
// (dashboard `apps/backend`, API `apps/api`). Seul point de variation : le sentinel d'horodatage
// serveur, propre au SDK de l'appelant (`serverTimestamp()` client, `FieldValue.serverTimestamp()`
// Admin), d'où son injection.

/**
 * @param {object} docItem enregistrement plat legacy (`type`, `brand`, `theme`, champs métier…)
 * @param {{ serverTimestamp: () => unknown }} deps
 * @returns {{ type: string, meta: object, stats: object, data: object }}
 */
export function transformWidgetData(docItem, { serverTimestamp }) {
  const { id, author, brand, theme, deleted, type, timeCreated, timeUpdated, counterViews, _originalStats, ...rest } = docItem;
  const baseType = (type || 'unknown').toLowerCase();
  
  const newDoc = {
    type: baseType,
    meta: {
      id: id || '',
      brand: brand || '',
      theme: theme || '',
      author: author || '',
      deleted: !!deleted,
      timeCreated: timeCreated || serverTimestamp(),
      timeUpdated: timeUpdated || serverTimestamp()
    },
    stats: {
      ...(_originalStats || {}),
      views: (counterViews || _originalStats?.views || 0)
    },
    data: {}
  };

  switch (baseType) {
    case 'facts':
      newDoc.data.title = rest.rencontre || (rest.factsData && rest.factsData.rencontre) || '';
      newDoc.stats.reveal = rest.counterReveal ?? _originalStats?.reveal ?? 0;
      newDoc.data.date = rest.date || (rest.factsData && rest.factsData.date) || '';
      
      const rawItems = rest.items || (rest.factsData && rest.factsData.items) || [];
      const cleanItemsForDoc = [];
      
      (Array.isArray(rawItems) ? rawItems : Object.values(rawItems)).forEach(item => {
         const { votes, ...itemWithoutVotes } = item;
         cleanItemsForDoc.push(itemWithoutVotes);
      });
      
      newDoc.data.items = cleanItemsForDoc;
      newDoc.stats.ratingStats = rest.ratingStats || _originalStats?.ratingStats || {};
      break;
    case 'teaser':
      newDoc.data.title = rest.teaserTitle || '';
      newDoc.data.label = rest.teaserLabel || '';
      newDoc.stats.clicks = rest.counterClicks ?? _originalStats?.clicks ?? 0;
      newDoc.data.img = rest.img || '';
      break;
    case 'quiz':
      newDoc.data.title = rest.title || '';
      newDoc.data.conclusion = rest.conclusion || {};
      newDoc.data.questions = rest.questions || [];
      newDoc.stats.statsGlobal = rest.statsGlobal || _originalStats?.statsGlobal || {};
      newDoc.stats.statsQuestions = rest.statsQuestions || _originalStats?.statsQuestions || {};
      break;
    case 'potm':
      newDoc.data.context = rest.context || {};
      
      const rawPlayers = rest.players || [];
      const cleanPlayers = [];
      newDoc.stats.playersVotes = rest.playersVotes || _originalStats?.playersVotes || {};
      
      rawPlayers.forEach(p => {
         const pId = p.id;
         if (p.votes !== undefined && p.votes !== null) {
             if (newDoc.stats.playersVotes[pId] === undefined) {
                 newDoc.stats.playersVotes[pId] = p.votes;
             }
         }
         const { votes, ...playerWithoutVotes } = p;
         cleanPlayers.push(playerWithoutVotes);
      });
      
      newDoc.data.players = cleanPlayers;
      break;
    case 'natinotes': {
      newDoc.data.title = rest.title || '';
      newDoc.data.label = rest.label || '';
      newDoc.data.players = rest.players || [];
      newDoc.data.showRecap = rest.showRecap !== false;

      // Purge des distributions orphelines : un joueur retiré du widget
      // perd les notes déjà collectées (décision spec §3).
      const keptIds = new Set((rest.players || []).map((p) => p.id));
      const previousRatings = rest.playerRatings || _originalStats?.playerRatings || {};
      newDoc.stats.playerRatings = Object.fromEntries(
        Object.entries(previousRatings).filter(([playerId]) => keptIds.has(playerId))
      );
      break;
    }
    case 'tinder':
      newDoc.data.tinderTitle = rest.tinderTitle || '';
      newDoc.data.tinderLabel = rest.tinderLabel || '';
      newDoc.data.tinderCards = rest.tinderCards || [];
      newDoc.stats.tinderVotes = rest.tinderVotes || _originalStats?.tinderVotes || {};
      newDoc.data.tinderLegend = rest.tinderLegend || {};
      break;
    case 'prono':
      const pData = rest.pronoData || {};
      newDoc.stats.itemVotes = rest.itemVotes || _originalStats?.itemVotes || {};
      
      ['item1', 'item2', 'item3'].forEach(k => {
         if (pData[k]) {
             if (pData[k].votes !== undefined && pData[k].votes !== null) {
                 if (newDoc.stats.itemVotes[k] === undefined) {
                     newDoc.stats.itemVotes[k] = pData[k].votes;
                 }
             }
             delete pData[k].votes;
         }
      });
      newDoc.data.pronoData = pData;
      break;
    case 'folder':
      newDoc.data.folderName = rest.folderName || '';
      newDoc.data.folderLabel = rest.folderLabel || '';
      newDoc.data.folderLabelColor = rest.folderLabelColor || '';
      newDoc.data.img = rest.img || '';
      
      const rawButtons = rest.buttons || [];
      const cleanButtons = [];
      newDoc.stats.buttonClicks = rest.buttonClicks || _originalStats?.buttonClicks || {};
      
      rawButtons.forEach(btn => {
         const bId = btn.id;
         if (btn.buttonCounterClicks !== undefined && btn.buttonCounterClicks !== null) {
             if (newDoc.stats.buttonClicks[bId] === undefined) {
                 newDoc.stats.buttonClicks[bId] = btn.buttonCounterClicks;
             }
         }
         const { buttonCounterClicks, ...btnWithoutCounter } = btn;
         cleanButtons.push(btnWithoutCounter);
      });
      
      newDoc.data.buttons = cleanButtons;
      break;
    case 'calendar':
      newDoc.data.title = rest.calWording || rest.calName || '';
      newDoc.stats.seeAllClicks = rest.counterSeeAllClicks ?? _originalStats?.seeAllClicks ?? 0;
      newDoc.data.dates = rest.dates || [];
      newDoc.data.nbElemsToShow = rest.nbElemsToShow || 0;
      break;
    case 'poll':
      newDoc.data.question = rest.pollTxt || '';
      newDoc.data.answerTxts = rest.answerTxts || [];
      newDoc.stats.answerCounters = rest.answerCounters || _originalStats?.answerCounters || {};
      break;
    case 'testimony':
      newDoc.data.title = rest.title || '';
      newDoc.stats.msgSent = rest.counterMsgSent ?? _originalStats?.msgSent ?? 0;
      newDoc.data.subject = rest.subject || '';
      newDoc.data.question = rest.question || '';
      newDoc.data.timeExpires = rest.timeExpires || null;
      break;
    default:
      newDoc.data = { ...rest };
      break;
  }

  Object.keys(rest).forEach(key => {
    if (key.startsWith('linkGlobal')) newDoc.data[key] = rest[key];
  });

  // Purge le compteur de lien global si le lien a été supprimé
  if (!newDoc.data.linkGlobalHref || newDoc.data.linkGlobalHref.trim() === '') {
    delete newDoc.stats.globalLinkClicks;
  }

  const generateUnifiedTitle = (doc, legacyRest) => {
     let extractedTitle = "";
     switch (doc.type) {
       case 'poll':
         extractedTitle = doc.data?.question || legacyRest.pollTxt || "";
         break;
       case 'calendar':
         extractedTitle = legacyRest.calName || legacyRest.calWording || doc.data?.title || "";
         break;
       case 'teaser':
         extractedTitle = doc.data?.title || legacyRest.teaserTitle || "";
         if (typeof extractedTitle === 'string') {
           extractedTitle = extractedTitle.replace(/\\n|\n/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
         }
         break;
       case 'folder':
         extractedTitle = doc.data?.folderName || legacyRest.folderName || "";
         if (typeof extractedTitle === 'string') {
           extractedTitle = extractedTitle.replace(/\\n|\n/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
         }
         break;
       case 'tinder':
         extractedTitle = doc.data?.tinderTitle || legacyRest.tinderTitle || "";
         break;
       case 'quiz':
         extractedTitle = doc.data?.title || legacyRest.title || "";
         break;
       case 'testimony':
         extractedTitle = doc.data?.subject || legacyRest.subject || legacyRest.title || doc.data?.title || "Appel à témoignage";
         break;
       case 'potm':
         extractedTitle = doc.data?.context?.text || legacyRest.context?.text || "";
         break;
       case 'natinotes':
         extractedTitle = doc.data?.title || legacyRest.title || "";
         break;
       case 'prono':
         const i1 = doc.data?.pronoData?.item1?.name;
         const i2 = doc.data?.pronoData?.item2?.name;
         if (i1 && i2) {
             extractedTitle = `${i1} - ${i2}`;
         }
         break;
       case 'facts':
         extractedTitle = doc.data?.title || legacyRest.rencontre || "";
         break;
       default:
         extractedTitle = doc.meta?.title || doc.data?.title || "";
     }
     return extractedTitle || "Sans titre";
  };

  newDoc.meta.title = generateUnifiedTitle(newDoc, rest);

  return newDoc;
}
