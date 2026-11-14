import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { LockModule } from './infra/lock/lock.module';
import { StellarModule } from './infra/stellar/stellar.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AuthModule } from './modules/auth/auth.module';
import { OtpModule } from './modules/otp/otp.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { CommonModule } from './common/common.module';
import { EngineModule } from './modules/engine/engine.module.js';
import { AnchorModule } from './modules/anchor/anchor.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { AppVersionModule } from './modules/app-version/app-version.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      envFilePath: [resolve(__dirname, '../.env'), resolve(process.cwd(), '.env')],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    CommonModule,
    ThrottlerModule.forRoot({
      errorMessage: 'Too many requests. Please try again later.',
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    RedisModule,
    ...(process.env.QUEUE_ENABLED === 'true' ? [QueueModule] : []),
    LockModule,
    StellarModule,
    AuthModule,
    OtpModule,
    AccountsModule,
    WalletModule,
    SettlementsModule,
    EngineModule,
    AnchorModule,
    FeedbackModule,
    AppVersionModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Normalize all thrown errors to the API contract before sending responses.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
/** Composes the shared infrastructure and feature modules for the Nest API. */
export class AppModule {}
