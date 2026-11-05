/**
 * Prints the Stellar address and SECRET KEY (S...) of an app wallet, from its 12-word recovery phrase.
 *
 * Same derivation as the app and as sep10-token.ts (BIP39 seed -> SLIP-0010 path m/44'/148'/0'), so the
 * address printed here matches the one in the app (Profile, or the Receive screen).
 *
 *   npx tsx apps/mobile/scripts/secret-key.ts       # asks for the phrase, hidden
 *
 * The phrase can also come from the RECOVERY_PHRASE environment variable (it then lands in shell history, so
 * prefer the prompt). Nothing is stored or sent anywhere; the script works fully offline.
 *
 * WARNING: the secret key controls the wallet's funds. Anyone who sees it can spend everything. Use it only
 * for testnet work (Stellar Lab, Postman signing, importing into a test wallet). Never paste it into chat,
 * commit it, or share it, and clear your terminal afterwards.
 */
import readline from 'node:readline';
import { validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Keypair } from '@stellar/stellar-base';
import { HDKey } from 'micro-ed25519-hdkey';

const STELLAR_PATH = "m/44'/148'/0'";

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

async function main() {
  const keypair = walletKeypair(await getPhrase());

  console.log(`\nPublic address: ${keypair.publicKey()}`);
  console.log('(it should match the address in the app: Profile, or the Receive screen)\n');
  console.log(`Secret key:     ${keypair.secret()}\n`);
  console.log('⚠ This key controls the wallet. Do not share or commit it, and clear your terminal when done.\n');
}

void main();
