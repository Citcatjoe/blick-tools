import http from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { OAuth2Client } from 'google-auth-library';
import { loadConfig } from './config.js';
import { createCallerVerifier } from './auth.js';
import { createFirestoreStore } from './firestoreStore.js';
import { createImageStore } from './imageStore.js';
import { fetchImageSafely, toDashboardWebp } from './images.js';
import { createApp, logToStdout } from './app.js';

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  logToStdout('CRITICAL', error.message);
  process.exit(1);
}

// Identifiants par défaut (ADC) : le compte de service du service Cloud Run, projet Firestore
// = projet du service. Aucune clé JSON.
initializeApp();

const server = http.createServer(
  createApp({
    verifyCaller: createCallerVerifier({
      audience: config.audience,
      allowedCallers: config.allowedCallers,
      client: new OAuth2Client(),
    }),
    store: createFirestoreStore(getFirestore()),
    clientBaseUrl: config.clientBaseUrl,
    images: { fetch: (url) => fetchImageSafely(url), convert: toDashboardWebp },
    imageStore: createImageStore(getStorage().bucket(config.storageBucket)),
  }),
);

server.listen(config.port, () => {
  logToStdout('INFO', 'listening', {
    port: config.port,
    audience: config.audience,
    allowedCallers: [...config.allowedCallers],
    clientBaseUrl: config.clientBaseUrl,
    storageBucket: config.storageBucket,
  });
});

// Cloud Run envoie SIGTERM avant d'arrêter l'instance : finir les requêtes en cours.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
