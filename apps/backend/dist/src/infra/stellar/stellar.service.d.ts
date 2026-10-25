import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
export declare class StellarService {
    private readonly configService;
    readonly horizonServer: Horizon.Server;
    readonly sorobanRpcUrl: string;
    readonly networkPassphrase: string;
    constructor(configService: ConfigService);
}
