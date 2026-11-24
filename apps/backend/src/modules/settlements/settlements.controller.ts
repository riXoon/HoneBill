import { Body, Controller, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { Sep10JwtGuard } from '../../common/guards/sep10-jwt.guard.js';
import { VoucherStatusDto } from './dto/voucher-status.dto.js';
import { VoucherStatusService } from './voucher-status.service.js';

@Controller()
export class SettlementsController {
  constructor(private readonly statuses: VoucherStatusService) {}

  @Post('settlements')
  processSettlement() {
    // Older mobile builds interpret a hard 4xx as a failed payment. 409/PENDING blocks resubmission without doing that.
    throw new ApiResponseException(409, { status: 'PENDING', error: 'Online resubmission is disabled for SMS vouchers. Update HoneBill to check the payment status.' });
  }

  @Post('settlements/status')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 10_000 } })
  @UseGuards(Sep10JwtGuard)
  @Header('Cache-Control', 'private, no-store')
  async lookup(@Req() request: Request & { user: { sub: string } }, @Body() body: VoucherStatusDto) {
    return { vouchers: await this.statuses.lookup(request.user.sub, body.nonces) };
  }
}
