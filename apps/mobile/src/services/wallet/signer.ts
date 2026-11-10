import type * as StellarBase from '@stellar/stellar-base';
import { Buffer } from 'buffer';

import { UserFacingError } from '../api/client';
import { readSigningSecrets } from './deviceWallet';
import { walletSeedFromMnemonic } from './stellarKeys';

/**
 * Signs with the wallet key for one action, then is dropped. The key is derived from the stored recovery phrase
 * each time (about a second, sliced so the UI keeps drawing) rather than cached, so no secret outlives the action.
 */
export type WalletSigner = {
  publicKey: string;
  /** Base64 ed25519 signature over the UTF-8 bytes: the `Authorization` value `/engine/*` checks. */
  signMessage: (message: string) => string;
  /**
   * Signs a backend-prepared transaction and returns the signed envelope (base64 XDR). It refuses anything that
   * is not a single contract call paid for by this wallet.
   */
  signPreparedTransaction: (xdr: string, networkPassphrase: string) => string;
  /** Signs a SEP-10 challenge after checking it is one (sequence 0, only `manageData`, first one for this wallet). */
  signChallenge: (xdr: string, networkPassphrase: string) => string;
  /**
   * Signs a trustline to `assetCode` from `issuer` for this wallet. The transaction is built here from the account's
   * current `sequence`, so the server never supplies it. Returns the signed envelope (base64 XDR).
   */
  signTrustline: (sequence: string, assetCode: string, issuer: string, networkPassphrase: string) => string;
  /** The offline device key's raw public key as 64 hex characters, the form `/engine/deposit` takes. */
  offlineDevicePubkeyHex: string | null;
  /** The same key as a "G..." address, the form `/engine/offline-key` takes. */
  offlineDeviceAddress: string | null;
};

let stellar: Promise<typeof StellarBase> | null = null;

/**
 * The SDK is large; it is evaluated on the first signature, not at app start. This is a `require` inside a function,
 * not `import()`: Metro evaluates it on first call but keeps it in the main bundle, whereas `import()` makes a dev
 * build fetch a separate bundle from Metro at that moment, which fails ("Cannot read property 'reload' of
 * undefined") whenever the phone's live connection to Metro has dropped.
 */
export function loadStellar(): Promise<typeof StellarBase> {
  stellar ??= Promise.resolve().then(() => require('@stellar/stellar-base') as typeof StellarBase);
  return stellar;
}

/**
 * Base64 of any byte array. The Stellar build Metro picks (`stellar-base.min.js`) can hand back a plain
 * `Uint8Array`, whose `toString('base64')` ignores the argument and returns "1,2,3", so every conversion goes
 * through the `buffer` package instead of the method on whatever the SDK returned.
 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The wallet on this phone, checked against the signed-in account so nothing is ever signed for an account whose
 * key is not here (e.g. the phrase was replaced by a later sign-up).
 */
export async function openWalletSigner(expectedPublicKey: string): Promise<WalletSigner> {
  const [{ Keypair, TransactionBuilder, Transaction, Account, Asset, Operation }, { mnemonic, offlineKeyHex }] = await Promise.all([
    loadStellar(),
    readSigningSecrets(),
  ]);
  if (!mnemonic) {
    throw new UserFacingError("This phone doesn't hold your wallet key. Sign in again with your recovery phrase.");
  }

  const keypair = Keypair.fromRawEd25519Seed(Buffer.from(await walletSeedFromMnemonic(mnemonic)));
  if (keypair.publicKey() !== expectedPublicKey) {
    throw new UserFacingError("The wallet on this phone doesn't match your account. Sign in again with your recovery phrase.");
  }

  const offlineKeypair = offlineKeyHex ? Keypair.fromRawEd25519Seed(Buffer.from(offlineKeyHex, 'hex')) : null;
  const offlineDevicePubkeyHex = offlineKeypair ? toHex(offlineKeypair.rawPublicKey()) : null;

  const parse = (xdr: string, networkPassphrase: string) => {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    if (!(tx instanceof Transaction)) throw new UserFacingError('The server sent a transaction this app cannot sign.');
    return tx;
  };

  return {
    publicKey: keypair.publicKey(),
    offlineDevicePubkeyHex,
    offlineDeviceAddress: offlineKeypair ? offlineKeypair.publicKey() : null,
    signMessage: (message) => toBase64(keypair.sign(Buffer.from(message, 'utf8'))),
    signPreparedTransaction: (xdr, networkPassphrase) => {
      const tx = parse(xdr, networkPassphrase);
      const [operation] = tx.operations;
      if (tx.source !== keypair.publicKey() || tx.operations.length !== 1 || operation.type !== 'invokeHostFunction') {
        throw new UserFacingError('The server sent a transaction this app cannot sign.');
      }
      tx.sign(keypair);
      return toBase64(tx.toEnvelope().toXDR('raw'));
    },
    signTrustline: (sequence, assetCode, issuer, networkPassphrase) => {
      const tx = new TransactionBuilder(new Account(keypair.publicKey(), sequence), { fee: '1000', networkPassphrase })
        .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, issuer) }))
        .setTimeout(60)
        .build();
      tx.sign(keypair);
      return toBase64(tx.toEnvelope().toXDR('raw'));
    },
    signChallenge: (xdr, networkPassphrase) => {
      const tx = parse(xdr, networkPassphrase);
      const valid =
        tx.sequence === '0' &&
        tx.operations.length > 0 &&
        tx.operations.every((op) => op.type === 'manageData') &&
        tx.operations[0].source === keypair.publicKey();
      if (!valid) throw new UserFacingError('The server sent an invalid sign-in challenge.');
      tx.sign(keypair);
      const signed = toBase64(tx.toEnvelope().toXDR('raw'));
      if (__DEV__) {
        // Everything here is public. `ownSignatureValid` false means signing itself is broken on this runtime;
        // `roundTripOk` false means the encoded envelope is not what was signed (an encoding problem, not a key one).
        const back = TransactionBuilder.fromXDR(signed, networkPassphrase);
        const mine = back.signatures[back.signatures.length - 1];
        console.log(
          '[sep10] signed challenge',
          JSON.stringify({
            wallet: keypair.publicKey(),
            networkPassphrase,
            txHashHex: toHex(tx.hash()),
            operations: tx.operations.map((op) => ({ type: op.type, source: op.source, name: 'name' in op ? op.name : undefined })),
            signatureCount: back.signatures.length,
            ownSignatureValid: keypair.verify(tx.hash(), mine.signature()),
            roundTripOk: toHex(back.hash()) === toHex(tx.hash()),
            envelopeBase64Length: signed.length,
            envelopeLooksBase64: /^[A-Za-z0-9+/]+=*$/.test(signed),
          }),
        );
      }
      return signed;
    },
  };
}
