import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { constantTimeEqual } from './pin.util.js';
import { toDbPhone } from './phone.util.js';

export { toDbPhone } from './phone.util.js';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_ISSUER = 'honebill-otp';
const TOKEN_PURPOSE = 'phone-verification';

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function otpMatches(stored: string | number, provided: string): boolean {
  const expected = String(stored).trim();
  const expectedNormalized = expected.length < 6 ? expected.padStart(6, '0') : expected;
  const candidate = String(provided).trim();
  return constantTimeEqual(expectedNormalized, candidate);
}

export function getTestOtpCode(phone: string, env: Record<string, string | undefined> = process.env): string | null {
  if (env.OTP_TEST_MODE !== 'true') return null;
  const code = env.OTP_TEST_CODE?.trim() ?? '';
  if (!/^\d{6}$/.test(code)) return null;
  const allowList = (env.OTP_TEST_NUMBERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => toDbPhone(value));
  return allowList.includes(toDbPhone(phone)) ? code : null;
}

export function signVerificationToken(phone: string, secret = process.env.OTP_VERIFICATION_JWT_SECRET): string | null {
  if (!secret) return null;
  return jwt.sign({ purpose: TOKEN_PURPOSE }, secret, {
    algorithm: 'HS256',
    subject: toDbPhone(phone),
    issuer: TOKEN_ISSUER,
    expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
  });
}

export function verifyVerificationToken(token: string, phone: string, secret = process.env.OTP_VERIFICATION_JWT_SECRET): boolean {
  if (!secret) return false;
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
    }) as jwt.JwtPayload;
    return payload.purpose === TOKEN_PURPOSE && payload.sub === toDbPhone(phone);
  } catch {
    return false;
  }
}
