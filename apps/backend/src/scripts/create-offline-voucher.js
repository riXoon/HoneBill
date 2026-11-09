const crypto = require('node:crypto');
const readline = require('node:readline');
const { Address, Keypair, nativeToScVal, xdr } = require('@stellar/stellar-sdk');

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const I128_MAX = (1n << 127n) - 1n;
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.error(`Usage:
  node src/scripts/create-offline-voucher.js --token-id <id> --sender-id <short-id> --receiver-id <short-id> --amount-stroops <integer> --token-symbol <symbol> --token-contract <C...> [--gateway <G...>] [--contract-id <C...>]

Prompts for the enrolled offline-device secret without echoing it.
--gateway defaults to RELAYER_PUBLIC_KEY; --contract-id defaults to CONTRACT_ID.
For PHPC, the voucher includes the backend's 5000000-stroop protocol toll.
The voucher is printed to stdout; it is not sent by SMS or submitted.`);
  process.exit(0);
}

const tokenId = requiredOption('token-id');
const senderShortId = requiredOption('sender-id');
const receiverShortId = requiredOption('receiver-id');
const amountString = requiredOption('amount-stroops');
const tokenSymbol = requiredOption('token-symbol').toUpperCase();
const tokenContractId = requiredOption('token-contract');
const gatewayPublicKey = options.gateway ?? process.env.RELAYER_PUBLIC_KEY;
const contractId = options['contract-id'] ?? process.env.CONTRACT_ID;

if (!/^\d+$/.test(tokenId) || BigInt(tokenId) <= 0n || BigInt(tokenId) > BigInt(Number.MAX_SAFE_INTEGER)) {
  throw new Error('--token-id must be a positive safe integer database ID.');
}
if (!/^[0-9A-Za-z]{6}$/.test(senderShortId) || !/^[0-9A-Za-z]{6}$/.test(receiverShortId)) {
  throw new Error('--sender-id and --receiver-id must each be exactly six case-sensitive Base62 characters.');
}
if (!/^[1-9]\d*$/.test(amountString)) {
  throw new Error('--amount-stroops must be a positive integer string.');
}

const amountStroops = BigInt(amountString);
if (amountStroops > I128_MAX) throw new Error('--amount-stroops exceeds the Soroban i128 limit.');
if (!/^[A-Z0-9]{1,12}$/.test(tokenSymbol)) throw new Error('--token-symbol must be an uppercase asset symbol.');
if (!gatewayPublicKey) throw new Error('Provide --gateway or set RELAYER_PUBLIC_KEY.');
if (!contractId) throw new Error('Provide --contract-id or set CONTRACT_ID.');

const tollStroops = tokenSymbol === 'PHPC' ? 5_000_000n : 0n;
const nonce = crypto.randomBytes(32);

let tokenAddress;
let contractAddress;
let gatewayAddress;
try {
  tokenAddress = Address.fromString(tokenContractId);
  contractAddress = Address.fromString(contractId);
  gatewayAddress = Address.fromString(gatewayPublicKey);
} catch {
  throw new Error('--token-contract and --contract-id must be valid C-addresses; --gateway must be a valid G-address.');
}

const signedTuple = xdr.ScVal.scvVec([
  nativeToScVal(amountStroops, { type: 'i128' }),
  nativeToScVal(tollStroops, { type: 'i128' }),
  xdr.ScVal.scvBytes(nonce),
  xdr.ScVal.scvBytes(Buffer.from(receiverShortId, 'ascii')),
  gatewayAddress.toScVal(),
  tokenAddress.toScVal(),
  contractAddress.toScVal(),
]);

console.error(`Token: ${tokenSymbol} (database ID ${tokenId})`);
console.error(`Sender: ${senderShortId}`);
console.error(`Recipient: ${receiverShortId}`);
console.error(`Amount: ${amountStroops} stroops`);
console.error(`Protocol toll: ${tollStroops} stroops`);
console.error('This creates a spendable offline voucher. Review the details before proceeding.');

confirmRecipient(receiverShortId)
  .then(() => readSecret())
  .then((secret) => {
    const signer = Keypair.fromSecret(secret);
    const signature = signer.sign(Buffer.from(signedTuple.toXDR()));
    const voucher = [
      tokenId,
      senderShortId,
      receiverShortId,
      encodeBase62(amountStroops),
      nonce.toString('base64').replace(/=+$/, ''),
      signature.toString('base64').replace(/=+$/, ''),
    ].join(':');

    process.stderr.write(`Offline device public key: ${signer.publicKey()}\n`);
    process.stdout.write(`${voucher}\n`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--') || index + 1 >= args.length || args[index + 1].startsWith('--')) {
      throw new Error(`Invalid argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (Object.hasOwn(parsed, key)) throw new Error(`Duplicate option: ${arg}`);
    parsed[key] = args[index + 1];
    index += 1;
  }
  return parsed;
}

function requiredOption(name) {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing --${name}. Use --help for usage.`);
  return value;
}

function encodeBase62(value) {
  let number = value;
  let encoded = '';
  while (number > 0n) {
    encoded = BASE62_ALPHABET[Number(number % 62n)] + encoded;
    number /= 62n;
  }
  return encoded || '0';
}

function confirmRecipient(shortId) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve, reject) => {
    prompt.question(`Type recipient short ID ${shortId} to create this voucher: `, (answer) => {
      prompt.close();
      if (answer.trim() !== shortId) reject(new Error('Recipient confirmation did not match.'));
      else resolve();
    });
  });
}

function readSecret() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal to enter the device secret securely.'));
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
        if (character === '\u0003') return finish(new Error('Voucher creation cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0008' || character === '\u007f') secret = secret.slice(0, -1);
        else if (character >= ' ' && character <= '~') secret += character;
      }
    };

    process.stderr.write('Enter enrolled offline-device secret (input hidden): ');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
