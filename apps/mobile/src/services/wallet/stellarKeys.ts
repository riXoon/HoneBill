import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from 'micro-ed25519-hdkey';

import { yieldToEventLoop } from '../../utils/async';

/**
 * Pure key derivation (no storage, no React), so it can be checked against the SEP-0005 test vectors.
 *
 * A 12-word BIP-39 phrase gives the account key at m/44'/148'/0' (SEP-0005), the same path Stellar
 * wallets use, so the phrase can later be shown for backup or restored in another Stellar wallet.
 * `crypto.getRandomValues` must exist (react-native-get-random-values, imported in index.ts).
 */
const STELLAR_PATH = "m/44'/148'/0'";
/** 128 bits of entropy = 12 words. */
const MNEMONIC_STRENGTH = 128;

export function createMnemonic(): string {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** CRC16-XModem, the checksum Stellar's StrKey appends. */
function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/** A 32-byte ed25519 public key as a Stellar "G..." address (StrKey, version byte 6 << 3). */
export function encodeStellarPublicKey(publicKey: Uint8Array): string {
  const payload = new Uint8Array(1 + publicKey.length + 2);
  payload[0] = 6 << 3;
  payload.set(publicKey, 1);
  const crc = crc16(payload.subarray(0, 1 + publicKey.length));
  payload[payload.length - 2] = crc & 0xff;
  payload[payload.length - 1] = crc >> 8;
  return base32(payload);
}

/**
 * True only for a well-formed Stellar public address: "G", 56 base32 characters, version byte and CRC16 checksum
 * all correct. A key that fails this was truncated, altered or is not an address, and must not be shown as
 * the account's address or copied for someone to send money to.
 */
export function isValidStellarPublicKey(address: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return false;
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of address) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  // 1 version byte + 32 key bytes + 2 checksum bytes.
  if (bytes.length !== 35 || bytes[0] !== 6 << 3) return false;
  const payload = Uint8Array.from(bytes.slice(0, 33));
  const crc = crc16(payload);
  return bytes[33] === (crc & 0xff) && bytes[34] === crc >> 8;
}

export type DeviceKeyPair = {
  /** 32-byte ed25519 private seed as 64 hex characters. It signs offline vouchers and never leaves the phone. */
  privateKeyHex: string;
  /** The "G..." address the backend stores as `offlineDeviceKey`. */
  publicKey: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The offline device key: an ed25519 key that is separate from the wallet and not derived from the
 * recovery phrase, so restoring the phrase on a new phone gives that phone its own device key.
 * `entropy` must be 32 random bytes. SLIP-0010's master-key step turns it into the ed25519 seed, which
 * `Keypair.fromRawEd25519Seed(privateKey)` accepts for signing later.
 */
export function deviceKeyPairFromEntropy(entropy: Uint8Array): DeviceKeyPair {
  if (entropy.length !== 32) throw new Error('Device key entropy must be 32 bytes.');
  const master = HDKey.fromMasterSeed(entropy);
  return { privateKeyHex: toHex(master.privateKey), publicKey: encodeStellarPublicKey(master.publicKeyRaw) };
}

/** A fresh random device key. Needs `crypto.getRandomValues` (react-native-get-random-values). */
export function createDeviceKeyPair(): DeviceKeyPair {
  return deviceKeyPairFromEntropy(crypto.getRandomValues(new Uint8Array(32)));
}

/** Longest stretch of the seed calculation that runs without letting the UI draw, in ms (a frame is ~16; each pause costs a timer round trip, so slices cannot be tiny). */
const SEED_SLICE_MS = 12;

/**
 * The BIP-39 seed: PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic". It is the same result as
 * `@scure/bip39`'s `mnemonicToSeed`, but computed with this app's own `@noble/hashes`, whose pause between
 * slices is a real timer. The copy bundled inside `@scure/bip39` pauses with a microtask, which never lets
 * the UI draw, so the screen froze for the whole calculation.
 */
async function seedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
  return pbkdf2Async(sha512, mnemonic.normalize('NFKD'), 'mnemonic', { c: 2048, dkLen: 64, asyncTick: SEED_SLICE_MS });
}

async function accountKeyFromMnemonic(mnemonic: string): Promise<HDKey> {
  const seed = await seedFromMnemonic(mnemonic);
  // The curve maths below cannot be sliced, so give the UI a turn before it starts.
  await yieldToEventLoop();
  return HDKey.fromMasterSeed(seed).derive(STELLAR_PATH);
}

/** The account's public address for a recovery phrase. The private key is never returned. */
export async function publicKeyFromMnemonic(mnemonic: string): Promise<string> {
  return encodeStellarPublicKey((await accountKeyFromMnemonic(mnemonic)).publicKeyRaw);
}

/**
 * The wallet's 32-byte ed25519 seed (`Keypair.fromRawEd25519Seed` takes it), for signing only. Hold it no
 * longer than the signature needs, and never store, log or send it.
 */
export async function walletSeedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
  return (await accountKeyFromMnemonic(mnemonic)).privateKey;
}
