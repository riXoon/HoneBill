import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.util.js';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [PrismaModule, StellarModule,
     ThrottlerModule.forRoot([{ ttl: 10_000, limit: 10 }]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
