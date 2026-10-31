import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { TextbeeSignatureGuard } from './guards/textbee-signature.guard.js';
import { SmsDispatchSecretGuard } from './guards/sms-dispatch-secret.guard.js';
import { SmsService, type SmsJob } from './sms.service.js';

interface TextbeeRequest extends Request {
  rawBody?: Buffer;
  traceId?: string;
}

@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  /** Authenticates a private dispatch request and returns its delivery result. */
  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SmsDispatchSecretGuard)
  async dispatch(@Body() body: SmsJob) {
    if (typeof body?.to !== 'string' || typeof body?.message !== 'string' || !body.message) {
      throw new ApiResponseException(400, { error: 'Job requires `to` and `message`' });
    }
    return this.sms.dispatch(body);
  }

  /** Exposes non-secret webhook configuration metadata for gateway health checks. */
  @Get('webhook')
  webhookHealth() {
    return this.sms.webhookHealth();
  }

  /** Accepts only HMAC-authenticated raw payloads, then delegates parsing and buffering. */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TextbeeSignatureGuard)
  async inboundWebhook(@Req() request: TextbeeRequest) {
    const rawBody = request.rawBody ?? (Buffer.isBuffer(request.body) ? request.body : undefined);
    if (!rawBody) {
      throw new ApiResponseException(400, { error: 'Invalid JSON body', traceId: request.traceId });
    }
    const result = await this.sms.processWebhook(rawBody, request.traceId ?? '');
    if (typeof result.error === 'string') throw new ApiResponseException(400, result);
    return result;
  }
}
