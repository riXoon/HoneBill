import { describe, expect, it } from '@jest/globals';

import { signVerificationToken, otpMatches, verifyVerificationToken } from '../modules/auth/otp.util';
import { normalizePhoneNumber, toDbPhone } from '../modules/auth/phone.util';
import { hashPin, verifyPin } from '../modules/auth/pin.util';

describe('Phase 2 auth/OTP smoke tests', () => {
  it('normalizes local Philippine phone numbers into the expected E.164 format', () => {
    expect(normalizePhoneNumber('09000000001')).toBe('+639000000001');
    expect(normalizePhoneNumber('+639000000001')).toBe('+639000000001');
    expect(toDbPhone('09000000001')).toBe('639000000001');
  });

  it('pads Redis-parsed stored OTPs but still requires the full six-digit submitted code', () => {
    expect(otpMatches(12345, '012345')).toBe(true);
    expect(otpMatches('012345', '12345')).toBe(false);
    expect(otpMatches('012345', '12346')).toBe(false);
    expect(otpMatches(123456, '123456')).toBe(true);
  });

  it('signs and verifies a phone verification token for the normalized phone number', () => {
    const phone = '+639000000001';
    const secret = 'phase2-test-secret';
    const token = signVerificationToken(phone, secret);

    expect(token).not.toBeNull();
    expect(verifyVerificationToken(token as string, phone, secret)).toBe(true);
    expect(verifyVerificationToken(token as string, '+639000000002', secret)).toBe(false);
  });

  it('hashes and verifies PIN values including plaintext upgrade behavior', async () => {
    const pin = '123456';
    const hashed = await hashPin(pin);

    await expect(verifyPin(pin, hashed)).resolves.toMatchObject({ ok: true, needsRehash: false });
    await expect(verifyPin(pin, pin)).resolves.toMatchObject({ ok: true, needsRehash: true });
  });
});
