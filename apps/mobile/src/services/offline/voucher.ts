import { Buffer } from 'buffer';

import { UserFacingError } from '../api/client';
import { readSigningSecrets } from '../wallet/deviceWallet';
import { loadStellar, toBase64 } from '../wallet/signer';
import { feeStroopsToCents, offlineFeeStroops } from './fees';
import { getOfflineSetup } from './offlineConfig';

/**
 * The offline payment voucher: the six `:`-separated fields the backend's SMS webhook parses
 * (`parseOfflineVoucher` in apps/backend/src/modules/settlements/offline-voucher.util.ts):
 *
 *   tokenDbId : senderShortId : receiverShortId : amountBase62 : nonce(base64, 32 bytes) : signature(base64, 64 bytes)
 *
 * The signature is the offline device key's Ed25519 signature over the XDR of the vector
 * (amount, toll, nonce, receiverShortId, gateway, token, contract), which the Soroban contract rebuilds and
 * checks in `spend_offline`. Nothing here needs the network: the gateway, token and contract come from the setup
 * cached while online, and signing uses the device key already on the phone.
 */

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const I128_MAX = (1n << 127n) - 1n;

export function encodeBase62(value: bigint): string {
  if (value <= 0n) throw new Error('Amount must be greater than zero');
  let rest = value;
  let out = '';
  while (rest > 0n) {
    out = BASE62_ALPHABET[Number(rest % 62n)] + out;
    rest /= 62n;
  }
  return out;
}

export type VoucherInput = {
  /** The signed-in wallet; the cached setup must belong to it. */
  walletPublicKey: string;
  senderShortId: string;
  receiverShortId: string;
  amountStroops: bigint;
  /** Random bytes for the nonce; the default is for production, a test passes fixed ones. */
  nonce?: Uint8Array;
};

export type SignedOfflineVoucher = { text: string; feeCents: number; assetCode: string };

export async function buildOfflineVoucher(input: VoucherInput): Promise<SignedOfflineVoucher> {
  const { Keypair, Address, nativeToScVal, xdr } = await loadStellar();
  if (input.amountStroops <= 0n || input.amountStroops > I128_MAX) throw new UserFacingError('Enter a valid amount.');

  const { offlineKeyHex } = await readSigningSecrets();
  if (!offlineKeyHex) {
    throw new UserFacingError('This phone has no offline payment key. Sign in again with your recovery phrase.');
  }
  const deviceKeypair = Keypair.fromRawEd25519Seed(Buffer.from(offlineKeyHex, 'hex'));

  // Only a setup made for this wallet and this device key is trusted: anything else is a voucher the contract rejects.
  const setup = await getOfflineSetup(input.walletPublicKey, deviceKeypair.publicKey());
  if (!setup) {
    throw new UserFacingError(
      'Offline payments are not set up on this phone yet. Open the app once with a connection, then try again.',
    );
  }
  const { config } = setup;
  const toll = offlineFeeStroops(input.amountStroops, config.tokenSymbol);
  const nonce = input.nonce ?? crypto.getRandomValues(new Uint8Array(32));
  if (nonce.length !== 32) throw new Error('Nonce must be 32 bytes');

  // The order and types are the contract's: see `spend_offline` in contracts/src/lib.rs.
  const signed = xdr.ScVal.scvVec([
    nativeToScVal(input.amountStroops, { type: 'i128' }),
    nativeToScVal(toll, { type: 'i128' }),
    xdr.ScVal.scvBytes(Buffer.from(nonce)),
    xdr.ScVal.scvBytes(Buffer.from(input.receiverShortId, 'ascii')),
    Address.fromString(config.gatewayPublicKey).toScVal(),
    Address.fromString(config.tokenContractId).toScVal(),
    Address.fromString(config.contractId).toScVal(),
  ]).toXDR();
  const signature = deviceKeypair.sign(Buffer.from(signed));

  const voucher = [
    config.tokenDbId,
    input.senderShortId,
    input.receiverShortId,
    encodeBase62(input.amountStroops),
    toBase64(nonce),
    toBase64(signature),
  ].join(':');

  if (__DEV__) {
    // Development builds only. Everything here is public (the device key's private half is never logged), so it can
    // be pasted into a check script. To verify by hand: the backend rebuilds `signedXdrHex` from the same values and
    // checks `signatureHex` against `deviceKey` (settlements.util.ts: buildOfflineSignatureXdr + verifyOfflineVoucherSignature).
    const signedBytes = Buffer.from(signed);
    console.log(
      '[voucher] signed',
      JSON.stringify(
        {
          voucher,
          signedFields: {
            amountStroops: input.amountStroops.toString(),
            amountPesos: Number(input.amountStroops) / 1e7,
            tollStroops: toll.toString(),
            nonceHex: Buffer.from(nonce).toString('hex'),
            receiverShortId: input.receiverShortId,
            gatewayPublicKey: config.gatewayPublicKey,
            tokenContractId: config.tokenContractId,
            contractId: config.contractId,
          },
          sentFields: {
            tokenDbId: config.tokenDbId,
            senderShortId: input.senderShortId,
            amountBase62: encodeBase62(input.amountStroops),
          },
          deviceKey: deviceKeypair.publicKey(),
          walletPublicKey: input.walletPublicKey,
          signedXdrHex: Buffer.from(signedBytes).toString('hex'),
          signedXdrBase64: toBase64(signedBytes),
          signatureHex: Buffer.from(signature).toString('hex'),
          // The phone checks its own signature against the public key; false means the key or the bytes are wrong.
          signatureValidLocally: deviceKeypair.verify(signedBytes, signature),
          // Total taken from the vault: the contract debits amount + toll.
          totalDeductedStroops: (input.amountStroops + toll).toString(),
        },
        null,
        2,
      ),
    );
  }

  return { text: voucher, feeCents: feeStroopsToCents(toll), assetCode: config.tokenSymbol };
}
