import { describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import {
  generateOtp,
  getTestOtpCode,
  otpMatches,
  signVerificationToken,
  verifyVerificationToken,
} from './otp.util';
import { hashPin, isValidPinFormat, verifyPin } from './pin.util';
import { isPlausiblePhone, normalizePhoneNumber, toDbPhone } from './phone.util';

const SECRET = 'test-otp-secret';
const jwt = new JwtService();
// otpMatches accepts a stored value that Redis clients may return as a number.
const matches = otpMatches as unknown as (stored: unknown, input: string) => boolean;

// Legacy case 1
describe('hashPin', () => {
  it('produces a salted scrypt hash that verifies', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).toMatch(/^scrypt\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('1234');
    await expect(verifyPin('1234', a)).resolves.toEqual({ ok: true, needsRehash: false });
    expect((await verifyPin('4321', a)).ok).toBe(false);
  });
});

// Legacy cases 2 and 3
describe('verifyPin', () => {
  it('accepts a legacy plaintext PIN and flags it for rehash', async () => {
    await expect(verifyPin('1234', '1234')).resolves.toEqual({ ok: true, needsRehash: true });
    expect((await verifyPin('1235', '1234')).ok).toBe(false);
    expect((await verifyPin('12345', '1234')).ok).toBe(false);
  });

  it('rejects a malformed stored hash', async () => {
    expect((await verifyPin('1234', 'scrypt$broken')).ok).toBe(false);
  });
});

// Legacy case 4
describe('isValidPinFormat', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat(1234 as unknown as string)).toBe(false);
  });
});

// Legacy case 5
describe('generateOtp', () => {
  it('is always 6 digits', () => {
    for (let i = 0; i < 500; i += 1) expect(generateOtp()).toMatch(/^\d{6}$/);
  });
});

// Legacy case 6
describe('otpMatches', () => {
  it('handles numeric parsing of leading zeros', () => {
    expect(matches(42, '000042')).toBe(true);
    expect(matches('000042', ' 000042 ')).toBe(true);
    expect(matches(42, '42')).toBe(false);
    expect(matches('123456', '123457')).toBe(false);
  });
});

// Legacy case 7
describe('phone normalisation', () => {
  it('converges PH formats', () => {
    expect(normalizePhoneNumber('09171234567')).toBe('+639171234567');
    expect(normalizePhoneNumber('639171234567')).toBe('+639171234567');
    expect(normalizePhoneNumber('+63 917 123 4567')).toBe('+639171234567');
    expect(toDbPhone('09171234567')).toBe('639171234567');
    expect(toDbPhone('+639171234567')).toBe('639171234567');
    expect(isPlausiblePhone('123')).toBe(false);
    expect(isPlausiblePhone('+639171234567')).toBe(true);
  });
});

// Legacy cases 8, 9 and 10
describe('verification token', () => {
  it('is bound to the phone, in any input format', () => {
    const token = signVerificationToken('+639171234567', SECRET);
    expect(token).toBeTruthy();
    expect(verifyVerificationToken(token!, '639171234567', SECRET)).toBe(true);
    expect(verifyVerificationToken(token!, '09171234567', SECRET)).toBe(true);
    expect(verifyVerificationToken(token!, '+639999999999', SECRET)).toBe(false);
  });

  it('rejects a wrong secret, wrong purpose and expiry', () => {
    const base = { subject: '639171234567', issuer: 'pijin-otp' };
    const forged = jwt.sign({ purpose: 'phone-verification' }, { secret: 'other-secret', ...base });
    expect(verifyVerificationToken(forged, '639171234567', SECRET)).toBe(false);

    const wrongPurpose = jwt.sign({ purpose: 'sep10' }, { secret: SECRET, ...base });
    expect(verifyVerificationToken(wrongPurpose, '639171234567', SECRET)).toBe(false);

    const expired = jwt.sign(
      { purpose: 'phone-verification', exp: Math.floor(Date.now() / 1000) - 10 },
      { secret: SECRET, ...base },
    );
    expect(verifyVerificationToken(expired, '639171234567', SECRET)).toBe(false);
  });

  it('is not issued without a secret, and nothing verifies without one', () => {
    expect(signVerificationToken('+639171234567', undefined)).toBeNull();
    expect(verifyVerificationToken('anything', '639171234567', undefined)).toBe(false);
  });
});

// Box 3 leftover, not a legacy case: test-mode gating
describe('getTestOtpCode', () => {
  const env = (o: Record<string, string>) => o as Record<string, string | undefined>;

  it('returns the fixed code only for an allow-listed number in test mode', () => {
    const e = env({ OTP_TEST_MODE: 'true', OTP_TEST_NUMBERS: '09000000001', OTP_TEST_CODE: '012345' });
    expect(getTestOtpCode('+639000000001', e)).toBe('012345');
    expect(getTestOtpCode('+639000000002', e)).toBeNull();
  });

  it('returns null when test mode is off, including the string "false" and empty', () => {
    for (const mode of ['false', '']) {
      const e = env({ OTP_TEST_MODE: mode, OTP_TEST_NUMBERS: '09000000001', OTP_TEST_CODE: '012345' });
      expect(getTestOtpCode('+639000000001', e)).toBeNull();
    }
  });
});