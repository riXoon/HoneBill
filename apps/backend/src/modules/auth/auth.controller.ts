import {
  All, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, Body,
  UseInterceptors, type RawBodyRequest,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService } from './auth.service.js';
import { Throttle } from '@nestjs/throttler';
import { queryString } from '../../common/utils/query-string.js';
import { LegacyBodyException } from '../../common/exceptions/legacy-body.exception.js';
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

private extractTransaction(req: Request): unknown {
  const bad = () =>
    new LegacyBodyException(400, {
      error: 'Bad Request',
      message: "Request body must contain a valid 'transaction' field.",
    });
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  const body: unknown = req.body;

  if (/urlencoded|multipart\/form-data/.test(ct)) {
    return (body as Record<string, unknown> | undefined)?.transaction ?? '';
  }
  // text parser consumed the body: a string means we have raw text
  if (typeof body !== 'string' || body.length === 0) throw bad(); // legacy: JSON.parse('') throws
  try {
    const parsed = JSON.parse(body) as { transaction?: unknown } | null;
    return parsed?.transaction ?? '';
  } catch {
    throw bad();
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