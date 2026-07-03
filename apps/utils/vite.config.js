import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig(() => {
  // Try to load .env-prod from root if it exists
  const prodEnvPath = path.resolve(__dirname, '../../.env-prod');
  let prodEnv = {};
  
  if (fs.existsSync(prodEnvPath)) {
    const content = fs.readFileSync(prodEnvPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      const match = trimmedLine.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        prodEnv[key] = value;
      }
    });
  }

  return {
    envDir: '../../',
    base: "./",
    plugins: [react()],
    define: {
      'import.meta.env.VITE_FIREBASE_PROD_API_KEY': JSON.stringify(prodEnv.VITE_FIREBASE_API_KEY || ''),
      'import.meta.env.VITE_FIREBASE_PROD_AUTH_DOMAIN': JSON.stringify(prodEnv.VITE_FIREBASE_AUTH_DOMAIN || ''),
      'import.meta.env.VITE_FIREBASE_PROD_PROJECT_ID': JSON.stringify(prodEnv.VITE_FIREBASE_PROJECT_ID || ''),
      'import.meta.env.VITE_FIREBASE_PROD_STORAGE_BUCKET': JSON.stringify(prodEnv.VITE_FIREBASE_STORAGE_BUCKET || ''),
      'import.meta.env.VITE_FIREBASE_PROD_MESSAGING_SENDER_ID': JSON.stringify(prodEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || ''),
      'import.meta.env.VITE_FIREBASE_PROD_APP_ID': JSON.stringify(prodEnv.VITE_FIREBASE_APP_ID || ''),
    },
    server: {
      open: true,
    },
    build: {
      outDir: 'dist',
      assetsDir: "assets",
    },
  };
});
