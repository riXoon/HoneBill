import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StellarService } from '../../infra/stellar/stellar.service.js';
export declare class AuthService {
    private readonly configService;
    private readonly jwtService;
    private readonly stellar;
    private readonly logger;
    constructor(configService: ConfigService, jwtService: JwtService, stellar: StellarService);
    private get serverKeypair();
    private get homeDomains();
    private get networkPassphrase();
    get tokenIssuer(): string;
    getChallenge(account: string | undefined, memo?: string): {
        transaction: string;
        network_passphrase: string;
    };
    issueToken(transaction: string): Promise<{
        token: string;
    }>;
}
