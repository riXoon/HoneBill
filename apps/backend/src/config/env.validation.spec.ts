import { describe, expect, it } from '@jest/globals';
import { envValidationSchema } from './env.validation.js';

const SECRET = 'dedicated-fixture-otp-secret-32-characters';
const validate = (env: Record<string, string | undefined>) =>
  envValidationSchema.validate(env, { abortEarly: false, allowUnknown: true });

describe('OTP startup policy', () => {
  it.each([{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }])(
    'enforces production OTP settings with %o',
    (runtime) => {
      const valid = validate({ ...runtime, OTP_VERIFICATION_JWT_SECRET: SECRET });
      expect(valid.error).toBeUndefined();
      expect(valid.value).toMatchObject({ REQUIRE_OTP_TOKEN: true, OTP_TEST_MODE: false });
      for (const invalid of [
        {},
        { OTP_VERIFICATION_JWT_SECRET: ' ' },
        { OTP_VERIFICATION_JWT_SECRET: 'short' },
        { OTP_VERIFICATION_JWT_SECRET: SECRET, SECRET_SEP10_JWT_SECRET: SECRET },
        { OTP_VERIFICATION_JWT_SECRET: SECRET, OTP_TEST_MODE: 'true' },
        { OTP_VERIFICATION_JWT_SECRET: SECRET, REQUIRE_OTP_TOKEN: 'false' },
      ]) {
        expect(validate({ ...runtime, ...invalid }).error).toBeDefined();
      }
    },
  );

  it('accepts isolated dev test codes and requires a signing secret for strict purpose enforcement', () => {
    expect(validate({ NODE_ENV: 'test', OTP_TEST_MODE: 'true' }).error).toBeUndefined();
    expect(validate({ NODE_ENV: 'test', OTP_REQUIRE_PURPOSE: 'true' }).error).toBeDefined();
    expect(validate({ NODE_ENV: 'test', OTP_REQUIRE_PURPOSE: 'true', OTP_VERIFICATION_JWT_SECRET: SECRET }).error)
      .toBeUndefined();
  });
});
