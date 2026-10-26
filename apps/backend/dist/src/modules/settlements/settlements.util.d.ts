import { PrismaService } from '../../infra/prisma/prisma.service.js';
export declare function parseSettlementSmsBody(smsBody: string): {
    tokenId: string;
    senderShortId: string;
    receiverShortId: string;
    amountBase62: string;
    nonce: string;
    signature: string;
};
export declare class SettlementsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    processSettlement(smsBody: string): Promise<{
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
