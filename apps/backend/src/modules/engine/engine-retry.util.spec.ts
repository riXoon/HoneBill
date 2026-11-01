import { describe, expect, it } from '@jest/globals';
import {
  isRetryableSettlementError,
  normalizeSettlementFailure,
  normalizeSettlementUserFailure,
} from './engine-retry.util.js';

describe('engine settlement retry classification', () => {
  it.each(['status: 429', 'status: 502', 'status: 503', 'status: 504', 'ECONNRESET', 'tx_bad_seq', 'tx_insufficient_fee', 'timeout'])(
    'retries transient failure: %s', (message) => {
      expect(isRetryableSettlementError(new Error(message))).toBe(true);
    },
  );

  it.each(['Error(Contract, 6)', 'invalid signature', 'Token is inactive', 'Malformed SMS payload'])(
    'does not retry permanent failure: %s', (message) => {
      expect(isRetryableSettlementError(new Error(message))).toBe(false);
    },
  );

  it('normalizes voucher key and trustline errors', () => {
    expect(normalizeSettlementFailure(new Error('failed ED25519 verification'))).toContain('Offline device key mismatch');
    expect(normalizeSettlementFailure(new Error('trustline entry is missing for account G' + 'A'.repeat(55))))
      .toContain('Missing token trustline');
  });

  it('maps contract failures to user-facing messages without exposing raw errors', () => {
    expect(normalizeSettlementUserFailure(new Error('HostError: Error(Contract, 6)'))).toBe('Insufficient balance.');
    expect(normalizeSettlementUserFailure(new Error('private internal stack'))).toBe('');
    expect(isRetryableSettlementError('network error')).toBe(false);
  });
});
