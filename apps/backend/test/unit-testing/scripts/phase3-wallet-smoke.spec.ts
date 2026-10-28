import { describe, expect, it } from '@jest/globals';

import { buildTransactionHistory, isValidStellarPublicKey, normalizeAssetCode, stroopsToDecimalString } from '../../../src/modules/wallet/wallet.util';
import { parseSettlementSmsBody } from '../../../src/modules/settlements/settlements.util';

describe('Phase 3 wallet and settlements smoke tests', () => {
  it('normalizes asset codes and validates Stellar keys', () => {
    expect(normalizeAssetCode('phpc')).toBe('PHPC');
    expect(() => normalizeAssetCode('XLM')).toThrow('Unsupported asset code');

    const validKey = `G${'A'.repeat(55)}`;
    const invalidKey = 'G123';
    expect(isValidStellarPublicKey(validKey)).toBe(true);
    expect(isValidStellarPublicKey(invalidKey)).toBe(false);
  });

  it('serializes stroops without floating-point drift', () => {
    expect(stroopsToDecimalString(12345678n)).toBe('1.2345678');
    expect(stroopsToDecimalString(0n)).toBe('0');
  });

  it('sorts wallet history newest-first and preserves the phase-3 payload contract', () => {
    const history = buildTransactionHistory([
      { id: 'old', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'new', timestamp: '2024-02-01T00:00:00.000Z' },
      { id: 'mid', timestamp: '2024-01-15T00:00:00.000Z' },
    ]);

    expect(history[0]).toMatchObject({ id: 'new' });
    expect(history[1]).toMatchObject({ id: 'mid' });
    expect(history[2]).toMatchObject({ id: 'old' });
  });

  it('parses offline settlement messages in the expected six-part format', () => {
    const payload = parseSettlementSmsBody('1:abc123:def456:3v5K:nonce-123:signature-abc');

    expect(payload).toMatchObject({
      tokenId: '1',
      senderShortId: 'abc123',
      receiverShortId: 'def456',
      amountBase62: '3v5K',
      nonce: 'nonce-123',
      signature: 'signature-abc',
    });
  });
});
