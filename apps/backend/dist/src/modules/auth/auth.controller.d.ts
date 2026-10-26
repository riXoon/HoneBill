import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService } from './auth.service.js';
export declare class AuthController {
    private readonly authService;
    private readonly accountsService;
    constructor(authService: AuthService, accountsService: AccountsService);
    getChallenge(account?: string | string[], memo?: string | string[]): {
        transaction: string;
        network_passphrase: string;
    };
    postChallenge(body?: {
        transaction?: unknown;
    }): Promise<{
        token: string;
    }>;
    verifyPin(body?: {
        phoneNumber?: unknown;
        pin?: unknown;
    }): Promise<{
        success: boolean;
    }>;
}
