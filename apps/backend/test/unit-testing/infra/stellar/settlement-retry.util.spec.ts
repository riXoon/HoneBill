import { describe, expect, it } from '@jest/globals';
import { isRetryableSettlementError } from '../../../../src/infra/stellar/settlement-retry.util';

describe('isRetryableSettlementError', () => {
  it.each([
    'RPC request failed with status: 429', 'upstream returned status: 502',
    'service unavailable status: 503', 'gateway timeout status: 504',
    'connect ECONNREFUSED', 'read ETIMEDOUT', 'socket hang up', 'fetch failed',
    'tx_bad_seq', 'tx_insufficient_fee',
  ])('retries transient failure: %s', (message) => {
    expect(isRetryableSettlementError(new Error(message))).toBe(true);
  });

  it.each([
    'HostError: Error(Contract, 6)', 'HostError: Error(Contract, 5)',
    'Invalid Ed25519 signature', 'Account not found', 'Malformed payload',
  ])('does not retry permanent failure: %s', (message) => {
    expect(isRetryableSettlementError(new Error(message))).toBe(false);
  });

  it.each(['raw string', null, undefined, { error: 'object' }])(
    'handles non-Error values safely', (value) => {
      expect(isRetryableSettlementError(value)).toBe(false);
    },
  );
});
