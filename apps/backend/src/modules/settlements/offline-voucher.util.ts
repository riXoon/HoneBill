import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+=*$/;
const I128_MAX = (1n << 127n) - 1n;

export interface ParsedOfflineVoucher {
  tokenId: number;
  tokenIdStr: string;
  senderShortId: string;
  receiverShortId: string;
  amountBase62: string;
  amountStroops: bigint;
  nonceB64: string;
  signatureB64: string;
  nonce: Buffer;
  signature: Buffer;
}

/** Restores required Base64 padding while preserving already padded strings. */
export function restoreBase64Padding(value: string): string {
  return value + '='.repeat((4 - (value.length % 4)) % 4);
}

/** Converts the voucher's Base62 amount field into an integer number of stroops. */
export function decodeBase62(value: string): bigint {
  if (!value) throw new Error('Amount encoding is empty');
  let result = 0n;
  for (const character of value) {
    const digit = BASE62_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`Invalid Base62 character: '${character}'`);
    result = result * 62n + BigInt(digit);
  }
  return result;
}

/** Parse and validate the six-part SMS voucher without changing its wire format. */
export function parseOfflineVoucher(smsPayload: string): ParsedOfflineVoucher {
  const parts = smsPayload.trim().split(':');
  if (parts.length !== 6) {
    throw new Error(`Malformed SMS payload: expected 6 parts, got ${parts.length}`);
  }

  const [tokenIdStr, senderShortId, receiverShortId, amountBase62, nonceB64, signatureB64] = parts;
  const tokenId = Number.parseInt(tokenIdStr, 10);
  if (!/^\d+$/.test(tokenIdStr) || !Number.isSafeInteger(tokenId) || tokenId <= 0) {
    throw new Error('Invalid token ID');
  }
  if (!/^[0-9A-Za-z]{6}$/.test(senderShortId)) {
    throw new Error('senderShortId must be exactly 6 case-sensitive Base62 characters');
  }
  if (!/^[0-9A-Za-z]{6}$/.test(receiverShortId)) {
    throw new Error('receiverShortId must be exactly 6 case-sensitive Base62 characters');
  }

  const amountStroops = decodeBase62(amountBase62);
  if (amountStroops <= 0n) throw new Error('Amount must be greater than zero');
  if (amountStroops > I128_MAX) {
    throw new Error(`Amount ${amountStroops} exceeds i128::MAX — invalid voucher`);
  }

  const nonceUnpadded = nonceB64.replace(/=+$/, '');
  const signatureUnpadded = signatureB64.replace(/=+$/, '');
  if (nonceUnpadded.length > 0 && !BASE64_PATTERN.test(nonceUnpadded)) {
    throw new Error('Nonce contains invalid Base64 characters');
  }
  if (signatureUnpadded.length > 0 && !BASE64_PATTERN.test(signatureUnpadded)) {
    throw new Error('Signature contains invalid Base64 characters');
  }

  const nonce = Buffer.from(restoreBase64Padding(nonceB64), 'base64');
  const signature = Buffer.from(restoreBase64Padding(signatureB64), 'base64');
  if (nonce.length !== 32) throw new Error(`Nonce must decode to 32 bytes, got ${nonce.length}`);
  if (signature.length !== 64) {
    throw new Error(`Signature must decode to 64 bytes, got ${signature.length}`);
  }

  return {
    tokenId,
    tokenIdStr,
    senderShortId,
    receiverShortId,
    amountBase62,
    amountStroops,
    nonceB64,
    signatureB64,
    nonce,
    signature,
  };
}

/** Serialize the signed contract tuple; its bytes must stay compatible with the Rust contract. */
export function buildOfflineSignatureXdr(input: {
  amountStroops: bigint;
  tollStroops: bigint;
  nonce: Uint8Array;
  receiverShortId: string;
  gatewayPublicKey: string;
  tokenContractId: string;
  contractAddress?: string;
}): Buffer {
  const elements = [
    nativeToScVal(input.amountStroops, { type: 'i128' }),
    nativeToScVal(input.tollStroops, { type: 'i128' }),
    xdr.ScVal.scvBytes(Buffer.from(input.nonce)),
    xdr.ScVal.scvBytes(Buffer.from(input.receiverShortId, 'ascii')),
    Address.fromString(input.gatewayPublicKey).toScVal(),
    Address.fromString(input.tokenContractId).toScVal(),
  ];
  if (input.contractAddress) elements.push(Address.fromString(input.contractAddress).toScVal());
  return Buffer.from(xdr.ScVal.scvVec(elements).toXDR());
}

/** Checks the device's Ed25519 signature against the exact serialized contract tuple. */
export function verifyOfflineVoucherSignature(
  offlineDevicePublicKey: string,
  xdrBytes: Uint8Array,
  signature: Uint8Array,
): boolean {
  return Keypair.fromPublicKey(offlineDevicePublicKey).verify(
    Buffer.from(xdrBytes),
    Buffer.from(signature),
  );
}
