import { describe, expect, it } from '@jest/globals';

import { buildTransactionHistory, isValidStellarPublicKey, normalizeAssetCode, normalizeLimit, stroopsToDecimalString } from '../../../src/modules/wallet/wallet.util';
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
    const payload = parseSettlementSmsBody(`1:abc123:def456:3v5K:${Buffer.alloc(32, 1).toString('base64')}:${Buffer.alloc(64, 2).toString('base64')}`);

    expect(payload).toMatchObject({
      tokenId: '1',
      senderShortId: 'abc123',
      receiverShortId: 'def456',
      amountBase62: '3v5K',
      nonce: Buffer.alloc(32, 1).toString('base64'),
      signature: Buffer.alloc(64, 2).toString('base64'),
    });
  });

  it('clamps list limits and rejects malformed voucher amounts and nonce lengths', () => {
    expect(normalizeLimit('500')).toBe(100);
    expect(normalizeLimit('0')).toBe(50);
    expect(() => parseSettlementSmsBody('1:abc123:def456:!:bm9uY2U=:c2ln')).toThrow('Invalid Base62 character');
    expect(() => parseSettlementSmsBody('1:abc123:def456:3v5K:bm9uY2U=:c2ln')).toThrow('Nonce must decode to 32 bytes');
  });
});
