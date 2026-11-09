const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Keypair, Networks, TransactionBuilder } = require('@stellar/stellar-sdk');

const args = process.argv.slice(2);
const xdrFileIndex = args.indexOf('--xdr-file');
const expectedHashIndex = args.indexOf('--expected-hash');

if (args.includes('--help') || args.includes('-h')) {
  console.error(`Usage:
  node src/scripts/sign-soroban-transaction.js --xdr-file <path>
  node src/scripts/sign-soroban-transaction.js --xdr-file <path> --expected-hash <hash>

Reads an unsigned Soroban transaction XDR or an API JSON response containing
"xdr" and, optionally, "txHash". If a hash is supplied, verifies it; otherwise
computes the hash from the XDR. Prompts for hash confirmation and the sender's
secret key without echoing it, then writes signed XDR to stdout. It does not
submit the transaction.

Set STELLAR_NETWORK_PASSPHRASE to override the default Stellar Testnet passphrase.`);
  process.exit(0);
}

if (
  xdrFileIndex === -1 ||
  !args[xdrFileIndex + 1] ||
  (expectedHashIndex !== -1 && (!args[expectedHashIndex + 1] || args.length !== 4)) ||
  (expectedHashIndex === -1 && args.length !== 2)
) {
  throw new Error('Provide --xdr-file <path> and optionally --expected-hash <hash>. Use --help for usage.');
}

const networkPassphrase =
  process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
const xdrPath = path.resolve(args[xdrFileIndex + 1]);
const input = fs.readFileSync(xdrPath, 'utf8').trim();
const response = input.startsWith('{') ? JSON.parse(input) : null;
const xdr = response ? response.xdr : input;
const expectedHashValue = expectedHashIndex === -1
  ? response?.txHash
  : args[expectedHashIndex + 1];
const expectedHash = typeof expectedHashValue === 'string' ? expectedHashValue.toLowerCase() : null;

if (typeof xdr !== 'string' || xdr.length === 0) {
  throw new Error('Input must be transaction XDR or JSON containing a string "xdr" property.');
}
if (expectedHash !== null && !/^[a-f0-9]{64}$/i.test(expectedHash)) {
  throw new Error('The expected transaction hash must be 64 hexadecimal characters.');
}

const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
if (typeof transaction.source !== 'string') {
  throw new Error('Expected a Soroban transaction with a single source account.');
}
if (!transaction.operations.some((operation) => operation.type === 'invokeHostFunction')) {
  throw new Error('This signer only accepts Soroban contract-invocation transactions.');
}

const transactionHash = transaction.hash().toString('hex');
if (expectedHash !== null && transactionHash !== expectedHash) {
  throw new Error('Transaction XDR hash does not match the expected hash.');
}

console.error(`Network passphrase: ${networkPassphrase}`);
console.error(`Transaction source: ${transaction.source}`);
console.error(`Transaction hash: ${transactionHash}`);
if (expectedHash === null) {
  console.error('No API hash was provided; this hash was computed from the XDR.');
}
console.error(`Fee: ${transaction.fee} stroops`);
console.error(`Operations: ${transaction.operations.length}`);
console.error('The signed XDR will be printed to stdout; this script will not submit it.');

confirmHash(transactionHash)
  .then(() => readSecret())
  .then((secret) => {
    const signer = Keypair.fromSecret(secret);
    if (signer.publicKey() !== transaction.source) {
      throw new Error('The provided secret key does not match the transaction source account.');
    }

    transaction.sign(signer);
    process.stdout.write(`${transaction.toXDR()}\n`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

function confirmHash(hash) {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve, reject) => {
    prompt.question('Type the transaction hash to confirm signing: ', (answer) => {
      prompt.close();
      if (answer.trim().toLowerCase() !== hash) {
        reject(new Error('Transaction hash confirmation did not match.'));
      } else {
        resolve();
      }
    });
  });
}

function readSecret() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal to enter the secret key securely.'));
  }

  return new Promise((resolve, reject) => {
    let secret = '';
    const finish = (error) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(secret);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Signing cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          secret = secret.slice(0, -1);
        } else if (character >= ' ' && character <= '~') {
          secret += character;
        }
      }
    };

    process.stderr.write('Enter sender secret key (input hidden): ');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
