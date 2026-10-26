"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const ASSET_ISSUERS = {
    PHPC: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY',
    USDC: 'GDQGJU5JTW5IFCGS6JZTIGK57IKPW4N4LJWWEN7F3K3GSEJEYPVJ3BYA',
};
function normalizeAssetCode(assetCode) {
    const normalized = (assetCode ?? '').trim().toUpperCase();
    if (!normalized) {
        throw new Error('Missing required query parameter: assetCode');
    }
    if (!ASSET_ISSUERS[normalized]) {
        throw new Error(`Unsupported asset code: '${normalized}'. Supported assets: ${Object.keys(ASSET_ISSUERS).join(', ')}`);
    }
    return normalized;
}
function isValidStellarPublicKey(value) {
    return /^G[A-Z2-7]{55}$/.test((value ?? '').trim());
}
function stroopsToDecimalString(stroops, decimals = 7) {
    const divisor = BigInt(10 ** decimals);
    const whole = stroops / divisor;
    const remainder = stroops % divisor;
    const fraction = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
function buildTransactionHistory(items) {
    return [...items]
        .sort((left, right) => {
        const leftTime = new Date(String(left.timestamp ?? 0)).getTime();
        const rightTime = new Date(String(right.timestamp ?? 0)).getTime();
        return rightTime - leftTime;
    })
        .slice(0, 50);
}
function parseSettlementSmsBody(smsBody) {
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
strict_1.default.equal(normalizeAssetCode('phpc'), 'PHPC');
strict_1.default.throws(() => normalizeAssetCode('XLM'), /Unsupported asset code/);
strict_1.default.equal(isValidStellarPublicKey(validKey), true);
strict_1.default.equal(isValidStellarPublicKey('G123'), false);
strict_1.default.equal(stroopsToDecimalString(12345678n), '1.2345678');
strict_1.default.equal(stroopsToDecimalString(0n), '0');
const history = buildTransactionHistory([
    { id: 'old', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: 'new', timestamp: '2024-02-01T00:00:00.000Z' },
    { id: 'mid', timestamp: '2024-01-15T00:00:00.000Z' },
]);
strict_1.default.deepEqual(history.map((item) => item.id), ['new', 'mid', 'old']);
const payload = parseSettlementSmsBody('1:abc123:def456:3v5K:nonce-123:signature-abc');
strict_1.default.deepEqual(payload, {
    tokenId: '1',
    senderShortId: 'abc123',
    receiverShortId: 'def456',
    amountBase62: '3v5K',
    nonce: 'nonce-123',
    signature: 'signature-abc',
});
console.log('Phase 3 wallet and settlement smoke checks passed.');
//# sourceMappingURL=phase3-wallet-smoke.js.map