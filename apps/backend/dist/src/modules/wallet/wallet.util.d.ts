import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
export declare const ASSET_ISSUERS: Record<string, string>;
export declare function normalizeAssetCode(assetCode?: string): string;
export declare function isValidStellarPublicKey(value: string): boolean;
export declare function stroopsToDecimalString(stroops: bigint, decimals?: number): string;
export declare function buildTransactionHistory(items: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
export declare class WalletService {
    private readonly prisma;
    private readonly stellar;
    constructor(prisma: PrismaService, stellar: StellarService);
    getBalance(publicKey: string, assetCode: string): Promise<{
        balance: string;
    }>;
    getHistory(shortId?: string, publicKey?: string): Promise<{
        transactions: Record<string, unknown>[];
    }>;
    getVaultBalance(shortId?: string, publicKey?: string): Promise<{
        success: boolean;
        stellarPublicKey: string;
        shortId: string;
        balanceStroops: string;
        balancePHP: number;
    } | {
        success: boolean;
        stellarPublicKey: string | undefined;
        shortId: null;
        balanceStroops: string;
        balancePHP: number;
    }>;
    getTransactions(shortId: string, limit?: number): Promise<{
        success: boolean;
        data: any[];
    }>;
    confirmTransfer(txHash: string): Promise<{
        txHash: string;
        status: import("@prisma/client").$Enums.SettlementStatus;
        confirmedAt: Date | null;
    }>;
}
