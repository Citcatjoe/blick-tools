import { db } from './firebase';
import { doc, getDoc, getDocs, collection, runTransaction, onSnapshot, deleteField } from 'firebase/firestore';

/**
 * Récupère les données d'un widget spécifique via son ID.
 * @param {string} docRef - L'ID du document Firestore.
 * @param {string} collectionName - Le nom de la collection (défaut 'embeds').
 */
export async function fetchWidgetData(docRef, collectionName = 'widgets') {
  try {
    const factsRef = doc(db, collectionName, docRef);
    const docSnap = await getDoc(factsRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.error(`No document found in ${collectionName}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching widget data:', error);
    throw error;
  }
}

/**
 * Écoute en temps réel un document spécifique
 */
export function listenToWidgetData(docRef, callback, collectionName = 'widgets') {
  const factsRef = doc(db, collectionName, docRef);

  getDoc(factsRef).then((docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data(), false);
    } else {
      console.error('No document found');
      callback(null);
    }
  }).catch((error) => {
    console.error('Error fetching widget data:', error);
    callback(null);
  });

  return () => {};
}

/**
 * Écoute en temps réel la collection 'embeds' (utilisé par Backend / Utils)
 */
export function listenToEmbeds(callback, collectionName = 'widgets') {
  try {
    const embedsCol = collection(db, collectionName);
    return onSnapshot(
      embedsCol,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(data);
      },
      (error) => {
        console.error('Erreur lors de l’écoute Firestore :', error);
      }
    );
  } catch (err) {
    console.error('Impossible de démarrer l’écoute Firestore :', err);
  }
}

/**
 * Récupère la collection 'embeds' entière une seule fois (Backend / Utils)
 */
export async function fetchData(devMode, collectionName = 'widgets') {
  try {
    const embedsCol = collection(db, collectionName);
    const snapshot = await getDocs(embedsCol);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erreur lors du fetch Firestore :', error);
    throw error;
  }
}

/**
 * Incrémente le compteur de votes d'une carte Tinder via transaction
 */
export async function updateTinderCardVotesTransactional(docId, cardId, direction, collectionName = 'widgets') {
  let tinderDocRef = doc(db, collectionName, docId);
  await runTransaction(db, async (transaction) => {
    let tinderDoc = await transaction.get(tinderDocRef);
    
    if (!tinderDoc.exists()) {
      throw new Error(`Document does not exist in ${collectionName}!`);
    }
    
    const data = tinderDoc.data();
    const stats = data.stats || {};
    // Support de la nouvelle (stats.tinderVotes) et ancienne architecture (tinderVotes)
    const votes = { ...(stats.tinderVotes || data.tinderVotes || {}) };
    
    const voteEntry = votes[cardId] || { yes: 0, no: 0 };
    if (direction === 'left') {
      voteEntry.no = (voteEntry.no || 0) + 1;
    } else if (direction === 'right') {
      voteEntry.yes = (voteEntry.yes || 0) + 1;
    }
    votes[cardId] = voteEntry;
    
    if (data.stats !== undefined) {
      transaction.update(tinderDocRef, { 'stats.tinderVotes': votes });
    } else {
      transaction.update(tinderDocRef, { tinderVotes: votes });
    }
  });
}

/**
 * Met à jour le compteur "votes" d'un item Facts via transaction
 */
export async function updateFactItemVotesTransactional(docId, itemKey, increment, collectionName = 'widgets') {
  const docRef = doc(db, collectionName, docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      
      const stats = data.stats || {};
      const itemCounters = stats.itemCounters || {};
      
      const currentCounter = itemCounters[itemKey] || { votes: 0 };
      const currentVotes = currentCounter.votes || 0;
      
      const newVotes = increment ? currentVotes + 1 : Math.max(0, currentVotes - 1);
      
      const updates = {
          [`stats.itemCounters.${itemKey}`]: { votes: newVotes }
      };

      // Legacy cleanup if needed
      if (data.factsData && data.factsData.items && data.factsData.items[itemKey]) {
          const factsData = { ...data.factsData };
          const items = { ...factsData.items };
          const currentItem = { ...items[itemKey] };
          if (currentItem.votes !== undefined) {
              delete currentItem.votes;
              items[itemKey] = currentItem;
              factsData.items = items;
              updates.factsData = factsData;
          }
      }
      
      transaction.update(docRef, updates);
    });
  } catch (error) {
    console.error('Error updating item votes:', error);
  }
}

/**
 * Met à jour les statistiques de vote (Rating)
 */
export async function updateRatingStatsTransactional(docId, ratingValue, collectionName = 'widgets') {
  const docRef = doc(db, collectionName, docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      const stats = data.stats || {};
      const ratingStats = { ...(stats.ratingStats || data.ratingStats || {}) };
      
      const key = ratingValue.toString();
      ratingStats[key] = (ratingStats[key] || 0) + 1;
      
      const updates = {
        'stats.ratingStats': ratingStats
      };
      
      // Cleanup legacy root ratingStats if it exists
      if (data.ratingStats !== undefined) {
        updates.ratingStats = deleteField();
      }
      
      transaction.update(docRef, updates);
    });
  } catch (error) {
    console.error('Error updating rating stats:', error);
    throw error;
  }
}

/**
 * Met à jour les statistiques de réponse du Quiz
 */
export async function updateQuizStatsTransactional(docId, selectedAnswers, collectionName = 'widgets') {
  const docRef = doc(db, collectionName, docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      
      // Determine user score
      const userScore = selectedAnswers.filter(a => a && a.isCorrect).length;
      
      // Determine if using new nested structure or old flat structure
      const isNewStructure = data.stats !== undefined || data.data !== undefined;
      
      // Fetch stats
      const currentStatsGlobal = isNewStructure ? (data.stats?.statsGlobal || {}) : (data.statsGlobal || {});
      const currentStatsQuestions = isNewStructure ? (data.stats?.statsQuestions || {}) : (data.statsQuestions || {});
      
      // Update scoreDistribution
      const dist = { ...(currentStatsGlobal.scoreDistribution || {}) };
      dist[userScore] = (dist[userScore] || 0) + 1;
      const newStatsGlobal = { ...currentStatsGlobal, scoreDistribution: dist };
      
      // Update statsQuestions
      let newStatsQuestions;
      if (Array.isArray(currentStatsQuestions)) {
        newStatsQuestions = [...currentStatsQuestions];
      } else {
        newStatsQuestions = { ...currentStatsQuestions };
      }
      
      const questionsArray = isNewStructure ? (data.data?.questions || []) : (data.questions || []);
      
      selectedAnswers.forEach((answer, qIndex) => {
        if (!answer) return;
        
        let qId = null;
        if (Array.isArray(newStatsQuestions)) {
            // Legacy structure used array indices
            qId = qIndex;
        } else {
            // New structure uses question IDs
            const qObj = questionsArray[qIndex];
            if (qObj && qObj.id) {
                qId = qObj.id;
            } else {
                qId = qIndex; // Fallback
            }
        }
        
        if (qId !== null) {
            const currentQStats = newStatsQuestions[qId] || { correct: 0, incorrect: 0 };
            newStatsQuestions[qId] = {
                ...currentQStats,
                correct: (currentQStats.correct || 0) + (answer.isCorrect ? 1 : 0),
                incorrect: (currentQStats.incorrect || 0) + (!answer.isCorrect ? 1 : 0)
            };
        }
      });
      
      const updatePayload = {};
      
      if (isNewStructure) {
          const stats = data.stats || {};
          updatePayload.stats = {
              ...stats,
              statsGlobal: newStatsGlobal,
              statsQuestions: newStatsQuestions
          };
      } else {
          updatePayload.statsGlobal = newStatsGlobal;
          updatePayload.statsQuestions = newStatsQuestions;
      }
      
      // Remove any erroneous quizStats node created previously
      if (data.quizStats) {
          updatePayload.quizStats = deleteField();
      }
      
      transaction.update(docRef, updatePayload);
    });
  } catch (error) {
    console.error('Error updating quiz stats:', error);
    throw error;
  }
}
