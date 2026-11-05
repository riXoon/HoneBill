import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { RedisModule } from '../../infra/redis/redis.module.js';
import { AnchorController } from './anchor.controller.js';
import { AnchorService } from './anchor.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SECRET_SEP10_JWT_SECRET') || 'missing-secret',
      }),
    }),
  ],
  controllers: [AnchorController],
  providers: [AnchorService],
})
/** Groups the public SEP-1/SEP-24 discovery routes and SEP-10-protected transaction lookup. */
export class AnchorModule {}
