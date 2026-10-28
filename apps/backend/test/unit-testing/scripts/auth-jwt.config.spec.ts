import { describe, expect, it } from '@jest/globals';
import { DEFAULT_SEP10_JWT_TTL_SECONDS, parseTtl } from '../../../src/modules/auth/auth-jwt.config.js';

describe('parseTtl', () => {
  it.each([[undefined], [null], [''], ['   ']])('defaults to 86400 for %p', (raw) => {
    expect(parseTtl(raw as string | undefined)).toBe(DEFAULT_SEP10_JWT_TTL_SECONDS);
  });

  it('accepts a positive integer string', () => {
    expect(parseTtl('3600')).toBe(3600);
    expect(parseTtl(' 3600 ')).toBe(3600);
  });

  it('accepts a positive integer number', () => {
    expect(parseTtl(3600)).toBe(3600);
  });

  it('uses a caller-provided setting name and default for SEP-10 challenge timeout', () => {
    expect(parseTtl(undefined, 'SEP10_AUTH_TIMEOUT', 900)).toBe(900);
    expect(parseTtl('600', 'SEP10_AUTH_TIMEOUT', 900)).toBe(600);
    expect(() => parseTtl('abc', 'SEP10_AUTH_TIMEOUT', 900)).toThrow(
      'SEP10_AUTH_TIMEOUT must be a positive integer (seconds)',
    );
    expect(() => parseTtl('0', 'SEP10_AUTH_TIMEOUT', 900)).toThrow(
      'SEP10_AUTH_TIMEOUT must be a positive integer (seconds)',
    );
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5'], ['1e2x'], [0], [-5], [1.5], [NaN], [Infinity]])(
    'rejects %p',
    (raw) => {
      expect(() => parseTtl(raw as string | number)).toThrow(
        'SEP10_JWT_TIMEOUT must be a positive integer (seconds)',
      );
    },
  );
});