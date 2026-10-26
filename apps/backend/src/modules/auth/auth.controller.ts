import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService } from './auth.service.js';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountsService: AccountsService,
  ) {}

  @Get()
  getChallenge(@Query('account') account?: string | string[]) {
    return this.authService.getChallenge(typeof account === 'string' ? account : undefined);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  postChallenge(@Body() body?: { transaction?: unknown }) {
    const transaction = typeof body?.transaction === 'string' ? body.transaction : '';
    return this.authService.issueToken(transaction);
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