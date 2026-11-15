import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as SecureStore from 'expo-secure-store';

import { reportError } from './errorReporting';

/**
 * Lets the MPIN unlock the app with no connection, the way the fingerprint already does.
 *
 * The server stays the authority: whenever it can be reached, the MPIN is checked there. After each MPIN the server
 * accepts, the phone keeps a salted, stretched hash of it (never the MPIN itself) in the Keystore/Keychain, tied to
 * the phone number and wallet address it unlocked. With no connection the typed MPIN is checked against that hash.
 *
 * Wrong tries are limited here too, since the server's lockout cannot see them: 5 wrong tries lock offline sign-in
 * for 15 minutes, the same rule as the server. The count survives restarts.
 *
 * The hash is dropped when the MPIN changes or is reset (the next online sign-in saves the new one), and when the
 * phone no longer holds the account's wallet.
 */

const VERIFIER_KEY = 'honebill.mpin.verifier';
const ATTEMPTS_KEY = 'honebill.mpin.offlineAttempts';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;
/** Stretching for the hash. Takes well under a second on a low-end phone, sliced so the UI keeps drawing. */
const ITERATIONS = 20_000;
const SLICE_MS = 12;

type Verifier = { v: 1; phone: string; publicKey: string; salt: string; hash: string; iterations: number };
type Attempts = { failures: number; lockedUntil: number; lastFailureAt: number };

const NO_ATTEMPTS: Attempts = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };

export type OfflineMpinResult =
  | { ok: true; publicKey: string }
  /** Nothing saved for this number yet: an online sign-in with the MPIN is needed first. */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'wrong'; attemptsRemaining: number }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number };

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, pin, salt, { c: iterations, dkLen: 32, asyncTick: SLICE_MS });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key, OPTIONS);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function readVerifier(): Promise<Verifier | null> {
  const v = await readJson<Partial<Verifier>>(VERIFIER_KEY);
  if (
    v?.v !== 1 ||
    typeof v.phone !== 'string' ||
    typeof v.publicKey !== 'string' ||
    typeof v.salt !== 'string' ||
    typeof v.hash !== 'string' ||
    typeof v.iterations !== 'number'
  ) {
    return null;
  }
  return v as Verifier;
}

async function readAttempts(): Promise<Attempts> {
  const a = await readJson<Partial<Attempts>>(ATTEMPTS_KEY);
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { failures: num(a?.failures), lockedUntil: num(a?.lockedUntil), lastFailureAt: num(a?.lastFailureAt) };
}

async function writeAttempts(attempts: Attempts): Promise<void> {
  try {
    if (attempts.failures === 0 && attempts.lockedUntil === 0) await SecureStore.deleteItemAsync(ATTEMPTS_KEY, OPTIONS);
    else await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(attempts), OPTIONS);
  } catch {
    // Nothing more to do.
  }
}

/** Saves the hash of an MPIN the server has just accepted for `phone`, and clears the offline wrong-try count. */
export async function rememberMpin(phone: string, publicKey: string, pin: string): Promise<void> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(pin, salt, ITERATIONS);
    const verifier: Verifier = { v: 1, phone, publicKey, salt: bytesToHex(salt), hash: bytesToHex(hash), iterations: ITERATIONS };
    await SecureStore.setItemAsync(VERIFIER_KEY, JSON.stringify(verifier), OPTIONS);
    await writeAttempts(NO_ATTEMPTS);
  } catch (error) {
    // Offline MPIN sign-in is not offered until the next online sign-in. Reported, since it should never happen.
    reportError(error, { step: 'rememberMpin' });
  }
}

/** Drops the saved hash (MPIN changed or reset, or the wallet is no longer on this phone). */
export async function forgetMpin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(VERIFIER_KEY, OPTIONS);
  } catch {
    // Nothing to clear.
  }
}

/** Whether an offline MPIN check is possible for `phone`. */
export async function canCheckMpinOffline(phone: string): Promise<boolean> {
  return (await readVerifier())?.phone === phone;
}

/** Checks `pin` for `phone` against the saved hash, counting wrong tries. Never throws. */
export async function checkMpinOffline(phone: string, pin: string): Promise<OfflineMpinResult> {
  const verifier = await readVerifier();
  if (!verifier || verifier.phone !== phone) return { ok: false, reason: 'unavailable' };

  const now = Date.now();
  let attempts = await readAttempts();
  // A clock moved back past the last wrong try would otherwise end a lock early: count it as still locked.
  if (attempts.lockedUntil > 0 && now < attempts.lastFailureAt) attempts = { ...attempts, lockedUntil: now + LOCK_MS };
  if (attempts.lockedUntil > now) {
    return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil((attempts.lockedUntil - now) / 1000) };
  }
  // A lock that has run out starts a fresh count.
  if (attempts.lockedUntil > 0) attempts = NO_ATTEMPTS;

  let matches = false;
  try {
    const hash = await derive(pin, hexToBytes(verifier.salt), verifier.iterations);
    matches = sameBytes(hash, hexToBytes(verifier.hash));
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (matches) {
    await writeAttempts(NO_ATTEMPTS);
    return { ok: true, publicKey: verifier.publicKey };
  }

  const failures = attempts.failures + 1;
  if (failures >= MAX_TRIES) {
    await writeAttempts({ failures, lockedUntil: now + LOCK_MS, lastFailureAt: now });
    return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil(LOCK_MS / 1000) };
  }
  await writeAttempts({ failures, lockedUntil: 0, lastFailureAt: now });
  return { ok: false, reason: 'wrong', attemptsRemaining: MAX_TRIES - failures };
}
