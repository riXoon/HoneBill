import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

export const REDIS = Symbol('REDIS');

@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          url: config.getOrThrow('UPSTASH_REDIS_REST_URL'),
          token: config.getOrThrow('UPSTASH_REDIS_REST_TOKEN'),
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}