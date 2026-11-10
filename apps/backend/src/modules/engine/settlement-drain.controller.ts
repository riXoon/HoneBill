import { CanActivate, Controller, ExecutionContext, Get, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { SettlementDrainService, type DrainResult } from './settlement-drain.service.js';

/**
 * Accepts `Authorization: Bearer <CRON_SECRET>`, which is what Vercel Cron sends. With no CRON_SECRET configured the
 * route is closed to everyone, so it can never be left open by a missing variable.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('CRON_SECRET') ?? '';
    const header = context.switchToHttp().getRequest<Request>().header('authorization') ?? '';
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(header);
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Settles whatever is queued, for retries that were delayed by backoff and for jobs a webhook's own drain did not finish. */
@Controller('internal/settlements')
export class SettlementDrainController {
  constructor(private readonly drain: SettlementDrainService) {}

  @Get('drain')
  @UseGuards(CronSecretGuard)
  run(): Promise<DrainResult> {
    return this.drain.drain();
  }
}
