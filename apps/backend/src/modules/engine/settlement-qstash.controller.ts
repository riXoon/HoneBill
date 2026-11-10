import {
  CanActivate,
  Controller,
  ExecutionContext,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Receiver } from '@upstash/qstash';
import { UnrecoverableError } from 'bullmq';
import type { Request } from 'express';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { SettlementsService } from '../settlements/settlements.util.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';
import { SmsService } from '../sms/sms.service.js';
import { SettlementJobRunner } from './settlement-job.runner.js';
import { ENGINE_SETTLEMENT_JOB } from './settlement-queue.service.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Only QStash may call the settlement route: it signs every delivery (`Upstash-Signature`, a JWT over the exact body)
 * with the signing keys from the QStash console. Without both keys configured the route rejects everything.
 */
@Injectable()
export class QStashSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const signature = request.header('upstash-signature');
    const body = request.rawBody?.toString('utf8');
    const currentSigningKey = this.config.get<string>('QSTASH_CURRENT_SIGNING_KEY')?.trim();
    const nextSigningKey = this.config.get<string>('QSTASH_NEXT_SIGNING_KEY')?.trim();
    if (!signature || body === undefined || !currentSigningKey || !nextSigningKey) throw new UnauthorizedException();

    let valid = false;
    try {
      valid = await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body });
    } catch {
      valid = false;
    }
    if (!valid) throw new UnauthorizedException();
    return true;
  }
}

export type QStashSettlementResult =
  | { status: 'processed'; result: unknown }
  | { status: 'rejected'; reason: string };

/**
 * Where QStash delivers each voucher. The answer tells QStash what to do next:
 *  - 200 `processed`: settled (or already settled); done.
 *  - 200 `rejected`: the voucher can never settle (bad signature, unknown account, contract rejection); retrying
 *    would not help, so QStash stops. The reason is logged.
 *  - 503: a temporary problem (RPC timeout, network); QStash retries with backoff. A settlement already submitted is
 *    resumed on the retry, not sent twice.
 */
@Controller('settlements')
@SkipThrottle()
export class SettlementQStashController {
  private readonly logger = new Logger(SettlementQStashController.name);
  private readonly runner: SettlementJobRunner;

  constructor(settlements: SettlementsService, @Optional() sms?: SmsService) {
    this.runner = new SettlementJobRunner(settlements, sms);
  }

  @Post('qstash')
  @HttpCode(HttpStatus.OK)
  @UseGuards(QStashSignatureGuard)
  async process(
    @Req() request: RawBodyRequest,
    @Headers('upstash-message-id') messageId?: string,
    @Headers('upstash-retried') retried?: string,
  ): Promise<QStashSettlementResult> {
    const data = request.body as Partial<SettlementJobData> | null;
    if (!data || typeof data.smsBody !== 'string' || data.smsBody.length === 0) {
      return { status: 'rejected', reason: 'Settlement message is missing smsBody' };
    }
    const job = {
      id: messageId ?? 'qstash',
      name: ENGINE_SETTLEMENT_JOB,
      data: { smsBody: data.smsBody, senderPhone: data.senderPhone, traceId: data.traceId },
    };
    try {
      return { status: 'processed', result: await this.runner.run(job) };
    } catch (error) {
      if (error instanceof UnrecoverableError) return { status: 'rejected', reason: error.message };
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Settlement ${job.id} will be retried by QStash (attempt ${Number(retried ?? 0) + 1}): ${reason}`);
      throw new ApiResponseException(503, { error: 'Settlement not finished; it will be retried', reason });
    }
  }
}
