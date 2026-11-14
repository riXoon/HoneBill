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
import { VerifyPinDto } from '../accounts/dto/verify-pin.dto.js';
import { ChangeAvailabilityDto, ChangePinDto } from '../accounts/dto/change-pin.dto.js';

type QueryStringValue = string | string[] | Record<string, string>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get()
  getChallenge(@Query('account') account?: QueryStringValue) {
    return this.authService.getChallenge(queryString(account));
  }

 @Post()
 @HttpCode(HttpStatus.OK)
 @UseInterceptors(NoFilesInterceptor()) // fills req.body for multipart, rejects files
 postChallenge(@Req() req: RawBodyRequest<Request>) {
  return this.authService.issueToken(this.extractTransaction(req));
 }

 private extractTransaction(req: RawBodyRequest<Request>): string {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  try {
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const formBody = req.body as { transaction?: string | string[] } | undefined;
      const v = formBody?.transaction;
      const first = Array.isArray(v) ? v[0] : v; // formData.get returns the first value
      return typeof first === 'string' ? first : '';
    }
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string' ? req.body : '';
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    const transaction = (parsed as { transaction?: unknown }).transaction;
    return typeof transaction === 'string' ? transaction : '';
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
  verifyPin(@Body() body: VerifyPinDto) {
    return this.accountsService.verifyPin(body.phoneNumber, body.pin.trim());
  }

  @Post('pin/change')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changePin(@Body() body: ChangePinDto) {
    return this.accountsService.changePin(body.phoneNumber, body.currentPin.trim(), body.newPin.trim(), body.verificationToken);
  }

  /** Whether the MPIN / email can change now; checked with the PIN before the app asks for an SMS code. */
  @Post('change/availability')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  changeAvailability(@Body() body: ChangeAvailabilityDto) {
    return this.accountsService.changeAvailability(body.phoneNumber, body.pin.trim(), body.email);
  }
}
