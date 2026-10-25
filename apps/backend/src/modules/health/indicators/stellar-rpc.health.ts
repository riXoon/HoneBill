import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { StellarService } from '../../../infra/stellar/stellar.service';

@Injectable()
export class StellarRpcHealthIndicator extends HealthIndicator {
  constructor(private readonly stellarService: StellarService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const response = await fetch(this.stellarService.sorobanRpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'getHealth',
          params: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`RPC status ${response.status}`);
      }

      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Soroban RPC check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
