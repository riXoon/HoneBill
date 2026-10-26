import type { Request } from 'express';
import { OtpService } from './otp.service.js';
export declare class OtpController {
    private readonly otpService;
    constructor(otpService: OtpService);
    send(body: Record<string, unknown> | undefined, req: Request): Promise<{
        success: boolean;
        message: string;
    }>;
    verify(body: Record<string, unknown> | undefined): Promise<{
        verificationToken?: string | undefined;
        expiresIn?: number | undefined;
        success: boolean;
        message: string;
    }>;
}
