import { Global, Module } from '@nestjs/common';
import { StellarService } from './stellar.service';

/** Provides Horizon/Soroban clients; relayer transaction handling lives in the engine module. */
@Global()
@Module({
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
