import { describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext } from '@nestjs/common';
import { SmsDispatchSecretGuard } from './sms-dispatch-secret.guard.js';

describe('SmsDispatchSecretGuard', () => {
  const context = (secret?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ header: () => secret }) }),
  }) as unknown as ExecutionContext;

  it('requires a configured secret and rejects missing or incorrect credentials', () => {
    const guard = new SmsDispatchSecretGuard({ get: () => 'expected' } as any);
    expect(() => guard.canActivate(context())).toThrow();
    expect(() => guard.canActivate(context('incorrect'))).toThrow();
  });

  it('accepts the configured dispatch secret', () => {
    const guard = new SmsDispatchSecretGuard({ get: jest.fn(() => 'expected') } as any);
    expect(guard.canActivate(context('expected'))).toBe(true);
  });
});
