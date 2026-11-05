import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ApiResponseException } from '../../../common/exceptions/api-response.exception.js';

/** Keeps the dispatch compatibility endpoint private after its QStash caller is removed. */
@Injectable()
export class SmsDispatchSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  /** Compares the supplied dispatch credential in constant time and fails closed if unconfigured. */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('SMS_DISPATCH_SECRET') ?? '';
    const incoming = request.header('x-sms-dispatch-secret') ?? '';
    const expectedBytes = Buffer.from(expected);
    const incomingBytes = Buffer.from(incoming);
    const valid = expectedBytes.length > 0 &&
      incomingBytes.length === expectedBytes.length &&
      timingSafeEqual(incomingBytes, expectedBytes);
    if (!valid) throw new ApiResponseException(401, { error: 'Unauthorized' });
    return true;
  }
}
