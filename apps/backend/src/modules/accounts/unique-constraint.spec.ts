import { describe, expect, it } from '@jest/globals';
import { classifyAccountUniqueConstraint } from './unique-constraint.js';

describe('classifyAccountUniqueConstraint', () => {
  it('classifies Prisma driver-adapter constraint metadata', () => {
    expect(
      classifyAccountUniqueConstraint({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'account_stellar_public_key_key' },
            },
          },
        },
      }),
    ).toBe('stellarPublicKey');
    expect(
      classifyAccountUniqueConstraint({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'account_short_id_key' },
            },
          },
        },
      }),
    ).toBe('shortId');
  });

  it('supports Prisma field targets and leaves other unique constraints distinct', () => {
    expect(
      classifyAccountUniqueConstraint({ code: 'P2002', meta: { target: ['phoneNumber'] } }),
    ).toBe('phoneNumber');
    expect(
      classifyAccountUniqueConstraint({
        code: 'P2002',
        meta: { driverAdapterError: { cause: { constraint: { index: 'account_email_key' } } } },
      }),
    ).toBe('other');
    expect(classifyAccountUniqueConstraint({ code: 'P2003', meta: { target: 'phoneNumber' } })).toBe(
      null,
    );
  });
});
