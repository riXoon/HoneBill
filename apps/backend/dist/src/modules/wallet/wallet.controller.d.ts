import { WalletService } from './wallet.util.js';
export declare class WalletController {
    private readonly walletService;
    constructor(walletService: WalletService);
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
    getTransactions(shortId: string, limit?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    confirmTransfer(body: {
        txHash?: string;
    }): Promise<{
        txHash: string;
        status: import("@prisma/client").$Enums.SettlementStatus;
        confirmedAt: Date | null;
    }>;
}
