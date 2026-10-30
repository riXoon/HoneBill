import assert from 'node:assert/strict';

const ASSET_ISSUERS: Record<string, string> = {
  PHPC: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY',
  USDC: 'GDQGJU5JTW5IFCGS6JZTIGK57IKPW4N4LJWWEN7F3K3GSEJEYPVJ3BYA',
};

function normalizeAssetCode(assetCode: string): string {
  const normalized = (assetCode ?? '').trim().toUpperCase();
  if (!normalized) {
    throw new Error('Missing required query parameter: assetCode');
  }
  if (!ASSET_ISSUERS[normalized]) {
    throw new Error(`Unsupported asset code: '${normalized}'. Supported assets: ${Object.keys(ASSET_ISSUERS).join(', ')}`);
  }
  return normalized;
}

function isValidStellarPublicKey(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test((value ?? '').trim());
}

function stroopsToDecimalString(stroops: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals);
  const whole = stroops / divisor;
  const remainder = stroops % divisor;
  const fraction = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function buildTransactionHistory(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...items]
    .sort((left, right) => {
      const leftTime = new Date(String((left.timestamp as string | undefined) ?? 0)).getTime();
      const rightTime = new Date(String((right.timestamp as string | undefined) ?? 0)).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 50);
}

function parseSettlementSmsBody(smsBody: string): Record<string, string> {
  const payload = (smsBody ?? '').trim();
  const parts = payload.split(':');
  if (parts.length !== 6) {
    throw new Error('Malformed smsBody');
  }

  const [tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature] = parts;
  if (!tokenId || !senderShortId || !receiverShortId || !amountBase62 || !nonce || !signature) {
    throw new Error('Malformed smsBody');
  }

  return { tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature };
}

const validKey = `G${'A'.repeat(55)}`;

assert.equal(normalizeAssetCode('phpc'), 'PHPC');
assert.throws(() => normalizeAssetCode('XLM'), /Unsupported asset code/);
assert.equal(isValidStellarPublicKey(validKey), true);
assert.equal(isValidStellarPublicKey('G123'), false);
assert.equal(stroopsToDecimalString(12345678n), '1.2345678');
assert.equal(stroopsToDecimalString(0n), '0');

const history = buildTransactionHistory([
  { id: 'old', timestamp: '2024-01-01T00:00:00.000Z' },
  { id: 'new', timestamp: '2024-02-01T00:00:00.000Z' },
  { id: 'mid', timestamp: '2024-01-15T00:00:00.000Z' },
]);
assert.deepEqual(history.map((item) => item.id), ['new', 'mid', 'old']);

const payload = parseSettlementSmsBody('1:abc123:def456:3v5K:nonce-123:signature-abc');
assert.deepEqual(payload, {
  tokenId: '1',
  senderShortId: 'abc123',
  receiverShortId: 'def456',
  amountBase62: '3v5K',
  nonce: 'nonce-123',
  signature: 'signature-abc',
});

console.log('Phase 3 wallet and settlement smoke checks passed.');
