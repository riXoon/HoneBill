import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';

@Controller()
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post('register')
  register(@Body() body: Record<string, unknown>) {
    return this.accountsService.register(body);
  }

  @Get('users/check')
  checkUser(@Query('phone') phone: string) {
    return this.accountsService.checkUser(phone ?? '');
  }

  @Get('users/lookup')
  lookupUser(@Query('shortId') shortId?: string, @Query('phone') phone?: string) {
    return this.accountsService.lookupUser(shortId, phone);
  }
}
