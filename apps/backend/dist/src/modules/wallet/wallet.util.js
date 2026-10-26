"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = exports.ASSET_ISSUERS = void 0;
exports.normalizeAssetCode = normalizeAssetCode;
exports.isValidStellarPublicKey = isValidStellarPublicKey;
exports.stroopsToDecimalString = stroopsToDecimalString;
exports.buildTransactionHistory = buildTransactionHistory;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../../infra/prisma/prisma.service.js");
const stellar_service_js_1 = require("../../infra/stellar/stellar.service.js");
exports.ASSET_ISSUERS = {
    PHPC: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY',
    USDC: 'GDQGJU5JTW5IFCGS6JZTIGK57IKPW4N4LJWWEN7F3K3GSEJEYPVJ3BYA',
};
function normalizeAssetCode(assetCode) {
    const normalized = (assetCode ?? '').trim().toUpperCase();
    if (!normalized) {
        throw new common_1.BadRequestException('Missing required query parameter: assetCode');
    }
    if (!exports.ASSET_ISSUERS[normalized]) {
        throw new common_1.BadRequestException(`Unsupported asset code: '${normalized}'. Supported assets: ${Object.keys(exports.ASSET_ISSUERS).join(', ')}`);
    }
    return normalized;
}
function isValidStellarPublicKey(value) {
    return /^G[A-Z2-7]{55}$/.test(value.trim());
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
        const leftTime = new Date(String(left.timestamp ?? left.createdAt ?? 0)).getTime();
        const rightTime = new Date(String(right.timestamp ?? right.createdAt ?? 0)).getTime();
        return rightTime - leftTime;
    })
        .slice(0, 50);
}
let WalletService = class WalletService {
    prisma;
    stellar;
    constructor(prisma, stellar) {
        this.prisma = prisma;
        this.stellar = stellar;
    }
    async getBalance(publicKey, assetCode) {
        const key = publicKey.trim();
        if (!key) {
            throw new common_1.BadRequestException('Missing required query parameter: publicKey');
        }
        if (!isValidStellarPublicKey(key)) {
            throw new common_1.BadRequestException('Invalid Stellar public key format.');
        }
        const normalizedAsset = normalizeAssetCode(assetCode);
        try {
            const account = await this.stellar.horizonServer.loadAccount(key);
            const issuer = exports.ASSET_ISSUERS[normalizedAsset];
            const trustlineBalance = account.balances.find((balance) => {
                return balance.asset_type !== 'native' && balance.asset_code === normalizedAsset && balance.asset_issuer === issuer;
            });
            return { balance: trustlineBalance ? trustlineBalance.balance : '0.00' };
        }
        catch (error) {
            if (error?.response?.status === 404) {
                return { balance: '0.00' };
            }
            throw new common_1.BadGatewayException('Failed to load account from Stellar network.');
        }
    }
    async getHistory(shortId, publicKey) {
        const conditions = [];
        if (shortId) {
            conditions.push({ senderShortId: shortId });
            conditions.push({ receiverShortId: shortId });
        }
        if (publicKey) {
            conditions.push({ senderPublicKey: publicKey });
            conditions.push({ recipientPublicKey: publicKey });
        }
        const settlements = await this.prisma.settlement.findMany({
            where: conditions.length ? { OR: conditions } : undefined,
            include: { token: true },
            orderBy: { createdAt: 'desc' },
            take: 25,
        });
        const onlineTransfers = await this.prisma.onlineTransfer.findMany({
            where: conditions.length ? { OR: conditions } : undefined,
            include: { token: true },
            orderBy: { createdAt: 'desc' },
            take: 25,
        });
        const anchorTransactions = await this.prisma.anchorTransaction.findMany({
            where: publicKey ? { stellarAccount: publicKey } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 25,
        });
        const transactions = buildTransactionHistory([
            ...settlements.map((item) => ({
                id: String(item.id),
                type: item.senderShortId === shortId ? 'SEND' : 'RECEIVE',
                tag: 'OFFLINE',
                title: item.senderShortId === shortId ? `Sent to ${item.receiverShortId}` : `Received from ${item.senderShortId}`,
                amount: item.senderShortId === shortId ? `-${stroopsToDecimalString(item.amountStroops)}` : stroopsToDecimalString(item.amountStroops),
                assetCode: item.token?.symbol ?? 'PHPC',
                status: item.status,
                timestamp: item.createdAt.toISOString(),
            })),
            ...onlineTransfers.map((item) => ({
                id: item.txHash,
                type: item.senderPublicKey === publicKey ? 'SEND' : 'RECEIVE',
                tag: 'WALLET',
                title: item.senderPublicKey === publicKey ? `Sent to ${item.recipientPublicKey.slice(0, 8)}` : `Received from ${item.senderPublicKey.slice(0, 8)}`,
                amount: item.senderPublicKey === publicKey ? `-${stroopsToDecimalString(item.amountStroops)}` : stroopsToDecimalString(item.amountStroops),
                assetCode: item.token?.symbol ?? 'PHPC',
                status: item.status,
                timestamp: item.createdAt.toISOString(),
            })),
            ...anchorTransactions.map((item) => ({
                id: item.id,
                type: item.type === 'deposit' ? 'TRANSFER' : 'WITHDRAWAL',
                tag: 'WALLET',
                title: item.type === 'deposit' ? 'Deposit' : 'Withdrawal',
                amount: item.type === 'deposit'
                    ? stroopsToDecimalString(BigInt(String(Number(item.amountOut ?? 0) * 10_000_000)))
                    : `-${stroopsToDecimalString(BigInt(String(Number(item.amountOut ?? 0) * 10_000_000)))}`,
                assetCode: item.assetCode,
                status: item.status,
                timestamp: item.createdAt.toISOString(),
            })),
        ]);
        return { transactions };
    }
    async getVaultBalance(shortId, publicKey) {
        if (!shortId && !publicKey) {
            throw new common_1.BadRequestException("Please provide either 'shortId' or 'stellarPublicKey' query parameter");
        }
        if (publicKey && !isValidStellarPublicKey(publicKey)) {
            throw new common_1.BadRequestException('Invalid Stellar Public Key format');
        }
        if (shortId) {
            const account = await this.prisma.account.findUnique({ where: { shortId } });
            if (!account) {
                throw new common_1.NotFoundException(`Account not found for Short ID: ${shortId}`);
            }
            return {
                success: true,
                stellarPublicKey: account.stellarPublicKey,
                shortId,
                balanceStroops: '0',
                balancePHP: 0,
            };
        }
        return {
            success: true,
            stellarPublicKey: publicKey,
            shortId: null,
            balanceStroops: '0',
            balancePHP: 0,
        };
    }
    async getTransactions(shortId, limit = 50) {
        const normalizedShortId = shortId.trim();
        if (!normalizedShortId) {
            throw new common_1.BadRequestException('shortId query parameter is required');
        }
        const actualLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
        const settlements = await this.prisma.settlement.findMany({
            where: {
                OR: [{ senderShortId: normalizedShortId }, { receiverShortId: normalizedShortId }],
                status: 'SETTLED',
            },
            include: { token: true },
            orderBy: { createdAt: 'desc' },
            take: actualLimit,
        });
        return {
            success: true,
            data: settlements.map((item) => ({
                ...item,
                amountStroops: item.amountStroops.toString(),
            })),
        };
    }
    async confirmTransfer(txHash) {
        const normalizedTxHash = txHash.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/i.test(normalizedTxHash)) {
            throw new common_1.BadRequestException('txHash must be a 64-character hexadecimal string');
        }
        const transfer = await this.prisma.onlineTransfer.findUnique({ where: { txHash: normalizedTxHash } });
        if (!transfer) {
            throw new common_1.NotFoundException('Unknown online transfer');
        }
        return {
            txHash: normalizedTxHash,
            status: transfer.status,
            confirmedAt: transfer.confirmedAt,
        };
    }
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService,
        stellar_service_js_1.StellarService])
], WalletService);
//# sourceMappingURL=wallet.util.js.map