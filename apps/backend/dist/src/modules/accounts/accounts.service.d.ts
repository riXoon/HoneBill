import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
export declare class AccountsService {
    private readonly prisma;
    private readonly redisService;
    private readonly configService;
    constructor(prisma: PrismaService, redisService: RedisService, configService: ConfigService);
    private static assertUniqueViolation;
    register(payload: Record<string, unknown>): Promise<{
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
    verifyPin(phoneNumber: string, pin: string): Promise<{
        success: boolean;
    }>;
    private isOtpTokenRequired;
}
