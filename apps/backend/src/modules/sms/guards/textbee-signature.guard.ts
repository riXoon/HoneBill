import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { ApiResponseException } from '../../../common/exceptions/api-response.exception.js';
import { verifyTextbeeHmac, verifyTimestampDrift } from '../sms-security.util.js';

interface TextbeeWebhookRequest extends Request {
  rawBody?: Buffer;
  traceId?: string;
}

/** Authenticates the exact TextBee payload bytes before the controller parses its JSON. */
@Injectable()
export class TextbeeSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  /** Adds a trace ID and validates body size, optional timestamp, and HMAC before JSON handling. */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TextbeeWebhookRequest>();
    const traceId = request.traceId ?? randomUUID();
    request.traceId = traceId;

    const rawBody = request.rawBody ?? (Buffer.isBuffer(request.body) ? request.body : undefined);
    if (!rawBody) {
      throw new ApiResponseException(400, { error: 'Invalid JSON body', traceId });
    }
    if (rawBody.byteLength > 2048) {
      throw new ApiResponseException(413, { error: 'Payload too large', traceId });
    }

    const timestamp = request.header('x-timestamp') ?? request.header('x-textbee-timestamp');
    const drift = verifyTimestampDrift(timestamp);
    if (!drift.valid) {
      throw new ApiResponseException(401, {
        error: `Request timestamp rejected: ${drift.reason}`,
        traceId,
      });
    }

    const signature = request.header('x-signature') ?? request.header('x-textbee-signature');
    const secret = this.config.get<string>('TEXTBEE_WEBHOOK_SECRET') ?? '';
    if (!verifyTextbeeHmac(rawBody, signature ?? null, secret)) {
      throw new ApiResponseException(401, {
        error: 'Unauthorized: Invalid HMAC Signature',
        traceId,
      });
    }
    return true;
  }
}
