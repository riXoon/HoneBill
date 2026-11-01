import { describe, expect, it } from '@jest/globals';
import { getTestOtpCode } from './otp.util.js';

// The OTP gate assertions from legacy sms-delivery.test.ts belong with this helper.
describe('legacy SMS tester OTP gate', () => {
  it('requires enabled mode, a six-digit code, and an allow-listed normalized phone', () => {
    const env = { OTP_TEST_MODE: 'true', OTP_TEST_CODE: '123456', OTP_TEST_NUMBERS: '09171234567, +639990000000' };
    expect(getTestOtpCode('+639171234567', env)).toBe('123456');
    expect(getTestOtpCode('639990000000', env)).toBe('123456');
    expect(getTestOtpCode('+639181111111', env)).toBeNull();
    expect(getTestOtpCode('+639171234567', { ...env, OTP_TEST_MODE: 'false' })).toBeNull();
    expect(getTestOtpCode('+639171234567', { ...env, OTP_TEST_CODE: '12' })).toBeNull();
    expect(getTestOtpCode('+639171234567', {})).toBeNull();
  });
});
