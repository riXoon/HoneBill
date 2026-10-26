import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  getClient(): Redis {
    if (this.client) {
      return this.client;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');

    this.client = redisUrl
      ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null })
      : new Redis({
          host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          db: this.configService.get<number>('REDIS_DB', 0),
          lazyConnect: true,
          maxRetriesPerRequest: null,
        });

    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
