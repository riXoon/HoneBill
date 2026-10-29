import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  readonly horizonServer: Horizon.Server;
  readonly sorobanRpcUrl: string;
  readonly networkPassphrase: string;

  constructor(private readonly configService: ConfigService) {
    this.sorobanRpcUrl = this.configService.getOrThrow<string>('SOROBAN_RPC_URL');
    this.networkPassphrase = this.configService.getOrThrow<string>(
      'STELLAR_NETWORK_PASSPHRASE',
    );
    this.horizonServer = new Horizon.Server(
      this.configService.getOrThrow<string>('STELLAR_HORIZON_URL'),
    );
  }
}
