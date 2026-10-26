export { toDbPhone } from './phone.util.js';
export declare const OTP_TTL_SECONDS = 300;
export declare const OTP_MAX_ATTEMPTS = 5;
export declare const VERIFICATION_TOKEN_TTL_SECONDS: number;
export declare function generateOtp(): string;
export declare function otpMatches(stored: string | number, provided: string): boolean;
export declare function getTestOtpCode(phone: string, env?: Record<string, string | undefined>): string | null;
export declare function signVerificationToken(phone: string, secret?: string | undefined): string | null;
export declare function verifyVerificationToken(token: string, phone: string, secret?: string | undefined): boolean;
