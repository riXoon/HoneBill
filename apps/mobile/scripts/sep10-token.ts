/**
 * Gets a SEP-10 bearer token for an app account, to test the backend's authenticated routes in Postman.
 *
 * The app keeps no session yet: the backend's JWT is issued only after the account's wallet key signs a
 * challenge. That key lives on the phone as the 12-word recovery phrase, so this script re-derives it from
 * the phrase (the same way the app does) and runs the SEP-10 handshake against your backend.
 *
 *   npx tsx apps/mobile/scripts/sep10-token.ts                    # asks for the phrase, hidden
 *   npx tsx apps/mobile/scripts/sep10-token.ts --api http://192.168.1.5:3001
 *   npx tsx apps/mobile/scripts/sep10-token.ts --fund             # fund the account on testnet first
 *
 * The phrase can also come from the RECOVERY_PHRASE environment variable (it then lands in shell history, so
 * prefer the prompt). Nothing is stored, and neither the phrase nor any secret key is ever printed.
 *
 * The backend refuses accounts that do not exist on the Stellar network. App accounts start unfunded, so use
 * --fund once: it asks Stellar's public testnet faucet (friendbot) to create the account. It runs only when
 * the backend reports the testnet passphrase.
 */
import readline from 'node:readline';
import { validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Keypair, Transaction } from '@stellar/stellar-base';
import { HDKey } from 'micro-ed25519-hdkey';

const STELLAR_PATH = "m/44'/148'/0'";
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Reads a line without echoing it, so the phrase does not stay on screen or in the terminal scrollback. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let asked = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text: string) => {
      if (!asked) {
        asked = true;
        process.stdout.write(question);
      } else if (text.includes('\n')) {
        process.stdout.write('\n');
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getPhrase(): Promise<string> {
  const raw = process.env.RECOVERY_PHRASE ?? (await promptHidden('Recovery phrase (12 words, hidden): '));
  const phrase = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase, wordlist)) {
    fail('That is not a valid recovery phrase (check the words, their order and the count).');
  }
  return phrase;
}

function walletKeypair(phrase: string): Keypair {
  const seed = mnemonicToSeedSync(phrase);
  const privateKey = HDKey.fromMasterSeed(seed).derive(STELLAR_PATH).privateKey;
  return Keypair.fromRawEd25519Seed(Buffer.from(privateKey));
}

async function request(base: string, path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30_000), ...init });
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const reason = cause?.code ?? cause?.message ?? (error as Error).message;
    fail(`Cannot reach ${base} (${reason}). Is the backend running, and is the address right (--api)?`);
  }
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    const json: unknown = JSON.parse(text);
    if (json && typeof json === 'object') body = json as Record<string, unknown>;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body };
}

function message(body: Record<string, unknown>): string {
  return String(body.message ?? body.error ?? body.raw ?? 'no message');
}

/** The claims inside a JWT, read without verifying (the backend does the verifying). */
function claims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function main() {
  const base = (option('--api') ?? process.env.API_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '').replace(/\/api$/i, '');

  const keypair = walletKeypair(await getPhrase());
  const account = keypair.publicKey();
  console.log(`\nWallet address: ${account}`);
  console.log('(it should match the address in the app: Profile, or the Receive screen)');

  // 1. The server's challenge: a transaction it has already signed, naming this account.
  const challenge = await request(base, `/api/auth?account=${encodeURIComponent(account)}`);
  if (challenge.status !== 200 || typeof challenge.body.transaction !== 'string') {
    fail(`The backend did not give a challenge (HTTP ${challenge.status}): ${message(challenge.body)}`);
  }
  const passphrase = String(challenge.body.network_passphrase);

  // 2. Optional: create the account on testnet, because the backend rejects accounts the network does not know.
  if (flag('--fund')) {
    if (passphrase !== TESTNET_PASSPHRASE) fail(`Refusing to fund: the backend is on "${passphrase}", not testnet.`);
    console.log('\nAsking the Stellar testnet faucet to create the account...');
    try {
      const faucet = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(account)}`, {
        signal: AbortSignal.timeout(60_000),
      });
      // 400 means "already funded", which is fine.
      console.log(faucet.ok ? '  funded.' : `  faucet answered HTTP ${faucet.status} (an already-funded account answers 400, which is fine).`);
    } catch {
      fail('Could not reach friendbot.stellar.org.');
    }
  }

  // 3. Sign the challenge with the wallet key and exchange it for a token.
  const tx = new Transaction(challenge.body.transaction as string, passphrase);
  tx.sign(keypair);
  const signed = tx.toEnvelope().toXDR('base64');
  const issued = await request(base, '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signed }),
  });
  if (issued.status !== 200 || typeof issued.body.token !== 'string') {
    const hint = issued.status === 401 && /fund|exist/i.test(message(issued.body)) ? '\n  This account is not on the Stellar network yet. Run again with --fund.' : '';
    fail(`The backend refused the signed challenge (HTTP ${issued.status}): ${message(issued.body)}${hint}`);
  }
  const token = issued.body.token as string;

  // 4. Prove the token is accepted by a route behind the JWT guard (a read-only lookup, so nothing changes).
  const probe = await request(base, '/api/sep24/transaction?id=sep10-token-check', { headers: { Authorization: `Bearer ${token}` } });
  const accepted = probe.status !== 401;

  const c = claims(token);
  const exp = typeof c.exp === 'number' ? new Date(c.exp * 1000) : null;
  console.log('\n✔ Token issued');
  console.log(`  account (sub): ${String(c.sub ?? '?')}`);
  console.log(`  issuer (iss):  ${String(c.iss ?? '?')}`);
  if (exp) console.log(`  expires:       ${exp.toISOString()}  (${exp.toLocaleString()})`);
  console.log(`  guard check:   ${accepted ? `accepted (GET /api/sep24/transaction answered ${probe.status}, not 401)` : 'REJECTED (401) - the backend may use a different JWT secret or issuer'}`);
  console.log('\nPostman: Authorization tab -> Bearer Token, or add this header:\n');
  console.log(`Authorization: Bearer ${token}\n`);
  console.log('Routes that take it: POST/PATCH /api/engine/offline-key, POST /api/engine/recipient-registry, /api/sep24/*, /api/anchor/*.');
  console.log('Not these: /api/engine/deposit, /transfer and /withdraw use "Authorization: Bearer <base64 Ed25519 signature>" of a per-request message, not this token.\n');
}

void main();
