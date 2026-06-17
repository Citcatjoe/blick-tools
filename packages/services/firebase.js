import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with long polling fallback
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const prodConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_PROD_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_PROD_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROD_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_PROD_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_PROD_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_PROD_APP_ID,
};

let _prodDb = null;
if (prodConfig.apiKey) {
  const prodApp = initializeApp(prodConfig, "PROD_APP");
  _prodDb = initializeFirestore(prodApp, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
}
export const prodDb = _prodDb;
