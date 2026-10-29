import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon, rpc } from '@stellar/stellar-sdk';
import type { Client } from 'pijin_core';

@Injectable()
export class StellarService {
  readonly horizonServer: Horizon.Server;
  readonly sorobanServer: rpc.Server;
  private contractPromise?: Promise<Client>;
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
    this.sorobanServer = new rpc.Server(this.sorobanRpcUrl);
  }

  getContract(): Promise<Client> {
    if (!this.contractPromise) {
      const contractOptions = {
        contractId: this.configService.getOrThrow<string>('CONTRACT_ID'),
        rpcUrl: this.sorobanRpcUrl,
        networkPassphrase: this.networkPassphrase,
      };
      this.contractPromise = import('pijin_core').then(
        ({ Client: ContractClient }) => new ContractClient(contractOptions),
      );
    }
    return this.contractPromise;
  }
}
