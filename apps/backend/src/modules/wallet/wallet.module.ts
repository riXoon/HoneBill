import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.util.js';

@Module({
  imports: [PrismaModule, StellarModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
