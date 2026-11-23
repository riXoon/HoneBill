import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ConfigService } from '@nestjs/config';
import { constantTimeEqual } from './pin.util.js';
import { toDbPhone } from './phone.util.js';

export { toDbPhone } from './phone.util.js';

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_ISSUER = 'honebill-otp';
const TOKEN_PURPOSE = 'phone-verification';

export const OTP_PURPOSES = ['signup', 'recover_device', 'change_mpin', 'reset_mpin', 'change_email'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export function requiresOtpPurpose(config: ConfigService): boolean {
  const value = config.get<boolean | string>('OTP_REQUIRE_PURPOSE');
  return value === true || value === 'true';
}

export function isProductionOtpRuntime(nodeEnv: unknown, vercelEnv: unknown): boolean {
  return nodeEnv === 'production' || vercelEnv === 'production';
}

export function requiresOtpToken(config: ConfigService): boolean {
  const value = config.get<boolean | string>('REQUIRE_OTP_TOKEN');
  return isProductionOtpRuntime(config.get('NODE_ENV'), config.get('VERCEL_ENV')) ||
    requiresOtpPurpose(config) || value === true || value === 'true';
}

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
  if (isProductionOtpRuntime(env.NODE_ENV, env.VERCEL_ENV) || env.OTP_TEST_MODE !== 'true') return null;
  const code = env.OTP_TEST_CODE?.trim() ?? '';
  if (!/^\d{6}$/.test(code)) return null;
  const allowList = (env.OTP_TEST_NUMBERS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => toDbPhone(value));
  return allowList.includes(toDbPhone(phone)) ? code : null;
}

export function signVerificationToken(phone: string, secret = process.env.OTP_VERIFICATION_JWT_SECRET, action?: OtpPurpose): string | null {
  if (!secret) return null;
  return jwt.sign({ purpose: TOKEN_PURPOSE, action }, secret, {
    algorithm: 'HS256',
    subject: toDbPhone(phone),
    issuer: TOKEN_ISSUER,
    expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
  });
}

export function verifyVerificationToken(
  token: string,
  phone: string,
  secret = process.env.OTP_VERIFICATION_JWT_SECRET,
  action?: OtpPurpose,
  allowLegacy = false,
): boolean {
  if (!secret) return false;
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
    }) as jwt.JwtPayload;
    return payload.purpose === TOKEN_PURPOSE && payload.sub === toDbPhone(phone) &&
      (payload.action === action || (allowLegacy && payload.action === undefined));
  } catch {
    return false;
  }
}
