const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  quiet: true,
});

const { Keypair, TransactionBuilder } = require('@stellar/stellar-sdk');

async function main() {
  const publicKey = process.env.PARITY_PUBLIC?.trim();
  const paritySecret = process.env.PARITY_SECRET?.trim();

  if (!publicKey || !paritySecret) {
    throw new Error('PARITY_PUBLIC or PARITY_SECRET is missing from apps/backend/.env');
  }

  const signer = Keypair.fromSecret(paritySecret);

  if (signer.publicKey() !== publicKey) {
    throw new Error('PARITY_SECRET does not belong to PARITY_PUBLIC');
  }

  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

  const challengeResponse = await fetch(
    `${baseUrl}/api/v2/auth?account=${encodeURIComponent(publicKey)}`
  );
  const challenge = await challengeResponse.json();

  if (!challengeResponse.ok) {
    throw new Error(JSON.stringify(challenge));
  }

  const transaction = TransactionBuilder.fromXDR(
    challenge.transaction,
    challenge.network_passphrase
  );

  transaction.sign(signer);

  const signedXdr = transaction.toXDR();
  console.log('Signed challenge XDR:');
  console.log(signedXdr);

  const signedResponse = await fetch(`${baseUrl}/api/v2/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  });

  console.log(await signedResponse.text());
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});