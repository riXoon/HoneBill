import {
  All, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, Body,
  UseInterceptors, type RawBodyRequest,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService } from './auth.service.js';
import { Throttle } from '@nestjs/throttler';
import { queryString } from '../../common/utils/query-string.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get()
  getChallenge(@Query('account') account?: unknown) {
    return this.authService.getChallenge(queryString(account));
  }

 @Post()
@HttpCode(HttpStatus.OK)
@UseInterceptors(NoFilesInterceptor()) // fills req.body for multipart, rejects files
postChallenge(@Req() req: RawBodyRequest<Request>) {
  return this.authService.issueToken(this.extractTransaction(req));
}

private extractTransaction(req: RawBodyRequest<Request>): unknown {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  try {
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const v = (req.body as Record<string, unknown> | undefined)?.transaction;
      const first = Array.isArray(v) ? v[0] : v; // formData.get returns the first value
      return first ?? '';
    }
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string' ? req.body : '';
    const parsed = JSON.parse(raw) as { transaction?: unknown } | null;
    return parsed?.transaction ?? '';
  } catch {
    throw new ApiResponseException(400, {
      error: 'Bad Request',
      message: "Request body must contain a valid 'transaction' field.",
    });
  }
}

  @All()
  methodNotAllowed(@Res() response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).end();
  }

  @Post('pin/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  verifyPin(@Body() body?: { phoneNumber?: unknown; pin?: unknown }) {
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    return this.accountsService.verifyPin(phoneNumber, pin);
  }


}
