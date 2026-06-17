import { db } from './firebase';
import { doc, getDoc, getDocs, collection, runTransaction, onSnapshot } from 'firebase/firestore';

/**
 * Récupère les données d'un widget spécifique via son ID.
 * @param {string} docRef - L'ID du document Firestore.
 */
export async function fetchWidgetData(docRef) {
  try {
    const factsRef = doc(db, 'embeds', docRef);
    const docSnap = await getDoc(factsRef);

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.error('No document found');
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
export function listenToWidgetData(docRef, callback) {
  const factsRef = doc(db, 'embeds', docRef);

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
export function listenToEmbeds(callback) {
  try {
    const embedsCol = collection(db, 'embeds');
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
export async function fetchData() {
  try {
    const embedsCol = collection(db, 'embeds');
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
export async function updateTinderCardVotesTransactional(docId, cardIndex, direction) {
  const tinderDocRef = doc(db, 'embeds', docId);
  await runTransaction(db, async (transaction) => {
    const tinderDoc = await transaction.get(tinderDocRef);
    if (!tinderDoc.exists()) throw new Error('Document does not exist!');
    const data = tinderDoc.data();
    const votes = { ...data.tinderVotes } || {};
    const voteEntry = votes[cardIndex] || { yes: 0, no: 0 };
    if (direction === 'left') {
      voteEntry.no = (voteEntry.no || 0) + 1;
    } else if (direction === 'right') {
      voteEntry.yes = (voteEntry.yes || 0) + 1;
    }
    votes[cardIndex] = voteEntry;
    transaction.update(tinderDocRef, { tinderVotes: votes });
  });
}

/**
 * Met à jour le compteur "votes" d'un item Facts via transaction
 */
export async function updateFactItemVotesTransactional(docId, itemKey, increment) {
  const docRef = doc(db, 'embeds', docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      if (!data.factsData || !data.factsData.items || !data.factsData.items[itemKey]) return;
      
      const factsData = { ...data.factsData };
      const items = { ...factsData.items };
      const currentItem = { ...items[itemKey] };
      const currentVotes = currentItem.votes || 0;
      
      currentItem.votes = increment ? currentVotes + 1 : Math.max(0, currentVotes - 1);
      items[itemKey] = currentItem;
      factsData.items = items;
      
      transaction.update(docRef, { factsData });
    });
  } catch (error) {
    console.error('Error updating item votes:', error);
  }
}

/**
 * Met à jour les statistiques de vote (Rating)
 */
export async function updateRatingStatsTransactional(docId, ratingValue) {
  const docRef = doc(db, 'embeds', docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      const ratingStats = { ...(data.ratingStats || {}) };
      
      const key = ratingValue.toString();
      ratingStats[key] = (ratingStats[key] || 0) + 1;
      
      transaction.update(docRef, { ratingStats });
    });
  } catch (error) {
    console.error('Error updating rating stats:', error);
    throw error;
  }
}

/**
 * Met à jour les statistiques de réponse du Quiz
 */
export async function updateQuizStatsTransactional(docId, selectedAnswers) {
  const docRef = doc(db, 'embeds', docId);
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) throw new Error('Document does not exist!');
      
      const data = docSnap.data();
      const currentStats = data.quizStats || {};
      const newStats = { ...currentStats };
      
      for (const [qIndex, aIndex] of Object.entries(selectedAnswers)) {
        if (!newStats[qIndex]) newStats[qIndex] = {};
        newStats[qIndex][aIndex] = (newStats[qIndex][aIndex] || 0) + 1;
      }
      
      transaction.update(docRef, { quizStats: newStats });
    });
  } catch (error) {
    console.error('Error updating quiz stats:', error);
    throw error;
  }
}
