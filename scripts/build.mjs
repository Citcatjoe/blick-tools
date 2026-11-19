// Build double d'une app Vite : `dist-dev` (Firebase hors prod) et `dist-prod` (production).
//
// Usage : node scripts/build.mjs <app>        (ex. node scripts/build.mjs poll)
//         npm run build:<app>                 (même chose)
//
// Environnements (fichiers à la racine du monorepo, cf. ENVIRONNEMENTS.md) :
//   dist-dev  ← .env-test   (aujourd'hui : projet privé blick-tools-app)
//   dist-prod ← .env-prod   (projet blick-tools-app-42a99)
//
// Le `.env` actif n'est PAS utilisé : chaque build reçoit les variables de son fichier
// par l'environnement du processus (prioritaires sur les fichiers .env pour Vite), et toute
// variable VITE_* absente du fichier cible est vidée pour qu'aucune valeur de `.env` ne fuie.
// Après chaque build, on vérifie que le bundle cite le bon projet Firebase et pas l'autre.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  { name: 'dev', envFile: '.env-test' },
  { name: 'prod', envFile: '.env-prod' },
];

const app = process.argv[2];
const appDir = join(root, 'apps', app ?? '');
if (!app || !existsSync(join(appDir, 'vite.config.js'))) {
  console.error(`App Vite introuvable : apps/${app ?? '(aucune)'}`);
  process.exit(1);
}

function parseEnv(file) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.error(`Fichier d'environnement manquant : ${file}`);
    process.exit(1);
  }
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return vars;
}

const envs = Object.fromEntries(TARGETS.map((t) => [t.name, parseEnv(t.envFile)]));
const projectOf = (name) => envs[name].VITE_FIREBASE_PROJECT_ID;
for (const t of TARGETS) {
  if (!projectOf(t.name)) {
    console.error(`VITE_FIREBASE_PROJECT_ID absent de ${t.envFile}`);
    process.exit(1);
  }
}
if (projectOf('dev') === projectOf('prod')) {
  console.error(`.env-test et .env-prod visent le même projet (${projectOf('dev')}) : arrêt.`);
  process.exit(1);
}

// Toutes les VITE_* connues (.env actif, autres fichiers, processus) : vidées par défaut.
const knownViteKeys = new Set([
  ...Object.keys(process.env),
  ...Object.keys(existsSync(join(root, '.env')) ? parseEnv('.env') : {}),
  ...TARGETS.flatMap((t) => Object.keys(envs[t.name])),
].filter((k) => k.startsWith('VITE_')));

function bundleText(outDir) {
  const assets = join(appDir, outDir, 'assets');
  if (!existsSync(assets)) return '';
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
}
const quoted = (text, id) => text.includes(`"${id}"`) || text.includes(`'${id}'`) || text.includes(`\`${id}\``);

for (const t of TARGETS) {
  const outDir = `dist-${t.name}`;
  const blank = Object.fromEntries([...knownViteKeys].map((k) => [k, '']));
  const env = { ...process.env, ...blank, ...envs[t.name] };
  console.log(`\n▶ ${app} → ${outDir} (${t.envFile}, projet ${projectOf(t.name)})`);
  const r = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: appDir, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Échec du build ${outDir}`);
    process.exit(r.status ?? 1);
  }

  // Garde-fou : le bundle doit viser le bon projet, jamais l'autre.
  const other = TARGETS.find((o) => o.name !== t.name).name;
  const text = bundleText(outDir);
  if (!quoted(text, projectOf(t.name)) || quoted(text, projectOf(other))) {
    console.error(`✗ ${outDir} : projet Firebase inattendu dans le bundle (attendu ${projectOf(t.name)}).`);
    process.exit(1);
  }
  console.log(`✓ ${outDir} vise ${projectOf(t.name)}`);
}
