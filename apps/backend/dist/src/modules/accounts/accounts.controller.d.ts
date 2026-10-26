import { AccountsService } from './accounts.service.js';
export declare class AccountsController {
    private readonly accountsService;
    constructor(accountsService: AccountsService);
    register(body: Record<string, unknown>): Promise<{
        success: boolean;
        data: {
            role: import("@prisma/client").$Enums.Role;
            stellarPublicKey: string;
            offlineDeviceKey: string | null;
            phoneNumber: string | null;
            firstName: string | null;
            lastName: string | null;
            email: string | null;
            id: number;
            shortId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    checkUser(phone: string): Promise<{
        exists: boolean;
        stellarPublicKey?: undefined;
        shortId?: undefined;
    } | {
        exists: boolean;
        stellarPublicKey: string;
        shortId: string;
    }>;
    lookupUser(shortId?: string, phone?: string): Promise<{
        found: boolean;
        shortId: string;
        stellarPublicKey: string;
        offlineDeviceKey: string | null;
        displayName: string;
        firstName: string;
        lastName: string;
    }>;
}
