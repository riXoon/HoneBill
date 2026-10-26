import { SettlementsService } from './settlements.util.js';
export declare class SettlementsController {
    private readonly settlementsService;
    constructor(settlementsService: SettlementsService);
    processSettlement(body: {
        smsBody?: string;
    }): Promise<{
        txHash: string | null;
        status: import("@prisma/client").$Enums.SettlementStatus;
        duplicate: boolean;
        notes?: undefined;
        tokenSymbol?: undefined;
        senderShortId?: undefined;
        receiverShortId?: undefined;
        amountBase62?: undefined;
        nonce?: undefined;
    } | {
        txHash: null;
        status: string;
        notes: string;
        duplicate?: undefined;
        tokenSymbol?: undefined;
        senderShortId?: undefined;
        receiverShortId?: undefined;
        amountBase62?: undefined;
        nonce?: undefined;
    } | {
        txHash: null;
        status: string;
        tokenSymbol: string;
        senderShortId: string;
        receiverShortId: string;
        amountBase62: string;
        nonce: string;
        duplicate?: undefined;
        notes?: undefined;
    }>;
}
