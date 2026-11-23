import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletFundingService } from './wallet-funding.service.js';
import { WalletService } from './wallet.util.js';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [PrismaModule, StellarModule, AuthModule,
     ThrottlerModule.forRoot([{ ttl: 10_000, limit: 10 }]),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletFundingService],
  exports: [WalletService],
})
export class WalletModule {}
