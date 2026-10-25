import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { StellarService } from '../../../infra/stellar/stellar.service';
export declare class StellarRpcHealthIndicator extends HealthIndicator {
    private readonly stellarService;
    constructor(stellarService: StellarService);
    pingCheck(key: string): Promise<HealthIndicatorResult>;
}
