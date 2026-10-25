import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../../infra/prisma/prisma.service';
export declare class DatabaseHealthIndicator extends HealthIndicator {
    private readonly prisma;
    constructor(prisma: PrismaService);
    pingCheck(key: string): Promise<HealthIndicatorResult>;
}
