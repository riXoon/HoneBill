import { Global, Module } from '@nestjs/common';
import { LockModule } from '../lock/lock.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarService } from './stellar.service';
import { StellarTransactionManager } from './stellar-transaction-manager.service';

@Global()
@Module({
  imports: [LockModule, PrismaModule],
  providers: [StellarService, StellarTransactionManager],
  exports: [StellarService, StellarTransactionManager],
})
export class StellarModule {}
