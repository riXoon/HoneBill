const fs = require('node:fs');
const path = require('node:path');
const { Keypair } = require('@stellar/stellar-sdk');

const envPath = path.join(__dirname, '..', '..', '.env');
const args = new Set(process.argv.slice(2));
const writeEnv = args.has('--write');
const replaceEnv = args.has('--replace');

if (args.has('--help')) {
  console.log(`Usage:
  node src/scripts/generate-phase4-keys.js
  node src/scripts/generate-phase4-keys.js --write
  node src/scripts/generate-phase4-keys.js --write --replace

Without --write, prints the generated keypairs only.
--write updates apps/backend/.env placeholders, without replacing real keys.
--replace replaces existing Phase 4 keys. Use this only deliberately.`);
  process.exit(0);
}

const relayer = Keypair.random();
const registrar = Keypair.random();

const envValues = {
  RELAYER_PUBLIC_KEY: relayer.publicKey(),
  RELAYER_SECRET_KEY: relayer.secret(),
  REGISTRAR_PUBLIC_KEY: registrar.publicKey(),
  REGISTRAR_SECRET_KEY: registrar.secret(),
};

if (!writeEnv) {
  printEnv();
  console.log('\nAdd these values to apps/backend/.env.');
  console.log('Or run: npm run keys:phase4 -- --write');
  process.exit(0);
}

const exists = fs.existsSync(envPath);
if (!exists) {
  throw new Error('apps/backend/.env does not exist. Copy apps/backend/.env.example first.');
}

if (replaceEnv) {
  const backupPath = `${envPath}.key-generation-backup`;
  fs.copyFileSync(envPath, backupPath);
} else if (hasConfiguredPhase4Keys(fs.readFileSync(envPath, 'utf8'))) {
  throw new Error(
    'Real Phase 4 keys already exist in apps/backend/.env. No keys were changed. ' +
    'Use --write --replace only if you intend to replace them.',
  );
}

let envText = fs.readFileSync(envPath, 'utf8');
for (const [key, value] of Object.entries(envValues)) {
  envText = upsertEnvValue(envText, key, value);
}
fs.writeFileSync(envPath, envText, 'utf8');

printEnv();
console.log('\nUpdated apps/backend/.env.');
if (replaceEnv) {
  console.log(`Backup written to apps/backend/.env.key-generation-backup`);
}

function printEnv() {
  for (const [key, value] of Object.entries(envValues)) {
    console.log(`${key}="${value}"`);
  }
}

function hasConfiguredPhase4Keys(envText) {
  return Object.keys(envValues).some((key) => {
    const match = envText.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
    if (!match) return false;
    const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    return value !== '' && value !== 'G...' && value !== 'S...';
  });
}

function upsertEnvValue(envText, key, value) {
  const pattern = new RegExp(`^${key}\\s*=.*$`, 'm');
  const line = `${key}="${value}"`;
  return pattern.test(envText)
    ? envText.replace(pattern, line)
    : `${envText.trimEnd()}${envText.endsWith('\n') ? '' : '\n'}${line}\n`;
}
