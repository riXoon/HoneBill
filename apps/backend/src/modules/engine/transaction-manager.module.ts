import { Module } from '@nestjs/common';
import { LockModule } from '../../infra/lock/lock.module.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { StellarTransactionManager } from './stellar-transaction-manager.service.js';

@Module({
  imports: [LockModule, PrismaModule, StellarModule],
  providers: [StellarTransactionManager],
  exports: [StellarTransactionManager],
})
export class TransactionManagerModule {}
