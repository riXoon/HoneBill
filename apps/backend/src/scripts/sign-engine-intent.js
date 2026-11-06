const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  quiet: true,
});

const { Keypair, StrKey } = require('@stellar/stellar-sdk');

const usage = `Usage:
  ENGINE_SIGNING_SECRET=<wallet-secret> node src/scripts/sign-engine-intent.js deposit <senderPublicKey> <amountStroops>
  ENGINE_SIGNING_SECRET=<wallet-secret> node src/scripts/sign-engine-intent.js withdraw <senderPublicKey> <amountStroops>
  ENGINE_SIGNING_SECRET=<wallet-secret> node src/scripts/sign-engine-intent.js transfer <tokenAddress> <senderPublicKey> <recipientPublicKey> <amountStroops>

Loads apps/backend/.env automatically. The secret must belong to senderPublicKey.
Prints a Base64 signature suitable for Authorization: Bearer <signature>.
`;

function fail(message) {
  console.error(message);
  console.error(usage);
  process.exit(1);
}

const [operation, ...args] = process.argv.slice(2);
const secret = process.env.ENGINE_SIGNING_SECRET?.trim();

if (!secret) fail('ENGINE_SIGNING_SECRET is missing.');

let senderPublicKey;
let message;

if (operation === 'deposit' || operation === 'withdraw') {
  if (args.length !== 2) fail(`Expected senderPublicKey and amountStroops for ${operation}.`);
  [senderPublicKey] = args;
  const [, amountStroops] = args;
  message = `${operation}:${senderPublicKey}:${amountStroops}`;
} else if (operation === 'transfer') {
  if (args.length !== 4) fail('Expected tokenAddress, senderPublicKey, recipientPublicKey, and amountStroops for transfer.');
  const [tokenAddress, sender, recipient, amountStroops] = args;
  senderPublicKey = sender;
  message = `transfer:v2:online:${tokenAddress}:${sender}:${recipient}:${amountStroops}`;
} else {
  fail('Operation must be deposit, withdraw, or transfer.');
}

if (!StrKey.isValidEd25519PublicKey(senderPublicKey)) fail('senderPublicKey is not a valid Stellar Ed25519 public key.');

let signer;
try {
  signer = Keypair.fromSecret(secret);
} catch {
  fail('ENGINE_SIGNING_SECRET is not a valid Stellar secret key.');
}

if (signer.publicKey() !== senderPublicKey) {
  fail('ENGINE_SIGNING_SECRET does not belong to senderPublicKey.');
}

const signature = signer.sign(Buffer.from(message, 'utf8')).toString('base64');
console.log(`Message: ${message}`);
console.log(`Authorization: Bearer ${signature}`);
