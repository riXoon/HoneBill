#!/usr/bin/env node
// Signs an engine request for Postman testing.
// Usage (secret never goes on the command line / shell history):
//   $env:SENDER_SECRET="S..."; node scripts/sign-intent.mjs deposit body.json
//   operations: deposit | withdraw | transfer
// Prints the Authorization header value to paste into Postman.
//
// Signed messages must match Ed25519SignatureGuard / engine.controller.ts:
//   deposit/withdraw: `${op}:${senderPublicKey}:${amountStroops}`
//   transfer (online v2): `transfer:v2:online:${token}:${sender}:${recipient}:${amount}`
import { readFileSync } from 'node:fs';
import { Keypair } from '@stellar/stellar-sdk';

const [op, bodyPath] = process.argv.slice(2);
const secret = process.env.SENDER_SECRET;
if (!op || !bodyPath || !secret) {
  console.error('Usage: SENDER_SECRET=S... node scripts/sign-intent.mjs <deposit|withdraw|transfer> <body.json>');
  process.exit(1);
}

const body = JSON.parse(readFileSync(bodyPath, 'utf8'));
const kp = Keypair.fromSecret(secret);
if (kp.publicKey() !== body.senderPublicKey) {
  console.error(`Secret key belongs to ${kp.publicKey()}, but body.senderPublicKey is ${body.senderPublicKey}`);
  process.exit(1);
}

const messages = {
  deposit: `deposit:${body.senderPublicKey}:${body.amountStroops}`,
  withdraw: `withdraw:${body.senderPublicKey}:${body.amountStroops}`,
  transfer: `transfer:v2:online:${body.tokenAddress}:${body.senderPublicKey}:${body.recipientPublicKey}:${body.amountStroops}`,
};
const message = messages[op];
if (!message) {
  console.error(`Unknown operation "${op}"`);
  process.exit(1);
}

console.log(`Signed message : ${message}`);
console.log(`Authorization  : Bearer ${kp.sign(Buffer.from(message, 'utf8')).toString('base64')}`);
