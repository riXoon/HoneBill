import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { parseTtl } from './auth-jwt.config.js'
   import { StellarModule } from '../../infra/stellar/stellar.module.js';
@Module({
  imports: [
    ConfigModule,
    AccountsModule,
    StellarModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
      const secret = config.get<string>('SECRET_SEP10_JWT_SECRET');
      if (!secret) {
        throw new Error('SECRET_SEP10_JWT_SECRET is required');
      }
      return {
        secret,
        signOptions: {
          algorithm: 'HS256' as const,
          expiresIn: parseTtl(config.get<string | number>('SEP10_JWT_TIMEOUT')),
        },
      };
    },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
