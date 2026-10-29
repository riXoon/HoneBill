import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function resolveDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === 'test' || !process.env.NODE_ENV
      ? 'postgresql://localhost:5432/mock'
      : '')
  );
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = resolveDatabaseUrl();
    if (!connectionString) {
      throw new Error('Missing DATABASE_URL');
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
