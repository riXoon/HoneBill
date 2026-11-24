import { Linking, Platform } from 'react-native';

import { SMS_GATEWAY_NUMBER } from '../../config/env';

/**
 * Reads an offline voucher without any crypto, so the relay scanner can recognise one cheaply. Same shape the backend's
 * SMS webhook accepts (`parseOfflineVoucher` in apps/backend/src/modules/settlements/offline-voucher.util.ts):
 *
 *   tokenDbId : senderShortId : receiverShortId : amountBase62 : nonce(base64, 32 bytes) : signature(base64, 64 bytes)
 *
 * Only the shape is checked here. The signature is checked by the backend and the contract, so a relayer can never
 * change who is paid or how much: any edit makes the voucher fail.
 */

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHORT_ID = /^[0-9A-Za-z]{6}$/;
const BASE64 = /^[A-Za-z0-9+/_-]+=*$/;
const STROOPS_PER_PESO = 10_000_000n;

export type RelayVoucher = {
  /** The voucher exactly as it is texted to the gateway. */
  text: string;
  senderShortId: string;
  receiverShortId: string;
  /** In pesos, for display only. */
  amount: number;
};

/** Bytes a base64 field decodes to, with or without padding. */
function base64Bytes(value: string): number {
  const bare = value.replace(/=+$/, '');
  return BASE64.test(value) ? Math.floor((bare.length * 3) / 4) : -1;
}

function decodeBase62(value: string): bigint | null {
  if (!value) return null;
  let out = 0n;
  for (const ch of value) {
    const digit = BASE62_ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    out = out * 62n + BigInt(digit);
  }
  return out;
}

/**
 * What the relay QR holds: the standard SMS QR format, `SMSTO:<gateway>:<voucher>`. Any phone camera or Google Lens
 * reads it as "send a text" and opens the messaging app with the gateway number and the voucher filled in, so a
 * partner without HoneBill (or who scans with their camera) knows where to send it. HoneBill's scanner reads it too.
 */
export function relayQrPayload(voucher: string): string {
  if (!SMS_GATEWAY_NUMBER) throw new MissingGatewayError('EXPO_PUBLIC_SMS_GATEWAY_NUMBER is not set');
  return `SMSTO:${SMS_GATEWAY_NUMBER}:${voucher}`;
}

/** Strips the `SMSTO:<number>:` (or `sms:<number>?body=`) wrapper of a relay QR, leaving the voucher. */
function unwrapSms(data: string): string {
  const smsto = /^smsto:[^:]*:([\s\S]*)$/i.exec(data);
  if (smsto) return smsto[1];
  const uri = /^sms:[^?&]*[?&]body=([^&]*)/i.exec(data);
  if (uri) {
    try {
      return decodeURIComponent(uri[1]);
    } catch {
      return data;
    }
  }
  return data;
}

/**
 * The voucher in a scanned QR code, or null when the code is something else. Accepts the relay QR's SMS format and a
 * bare voucher. The number inside the QR is ignored: HoneBill always texts its own gateway, so a doctored code cannot
 * make the partner text some other (paid) number.
 */
export function parseRelayVoucher(data: string): RelayVoucher | null {
  const text = unwrapSms(data.trim()).trim();
  const parts = text.split(':');
  if (parts.length !== 6) return null;
  const [tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature] = parts;
  if (!/^[1-9]\d*$/.test(tokenId)) return null;
  if (!SHORT_ID.test(senderShortId) || !SHORT_ID.test(receiverShortId)) return null;
  if (base64Bytes(nonce) !== 32 || base64Bytes(signature) !== 64) return null;
  const stroops = decodeBase62(amountBase62);
  if (stroops === null || stroops <= 0n) return null;
  const amount = Number(stroops / STROOPS_PER_PESO) + Number(stroops % STROOPS_PER_PESO) / 1e7;
  return { text, senderShortId, receiverShortId, amount };
}

/** Thrown when the payment gateway number is missing from the build's env. */
export class MissingGatewayError extends Error {}

/** Opens Messages with the gateway number and text filled in for the user to send. */
export async function openGatewaySms(message: string): Promise<void> {
  if (!SMS_GATEWAY_NUMBER) throw new MissingGatewayError('EXPO_PUBLIC_SMS_GATEWAY_NUMBER is not set');
  const separator = Platform.OS === 'ios' ? '&' : '?';
  await Linking.openURL(`sms:${SMS_GATEWAY_NUMBER}${separator}body=${encodeURIComponent(message)}`);
}
