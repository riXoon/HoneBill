import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OtpService } from './otp.service.js';
import { PinVerifyRateLimitGuard } from '../../common/guards/pin-verify-rate-limit.guard.js';
import { SendOtpDto } from './dto/otp.dto.js';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  send(@Body() body: SendOtpDto, @Req() req: Request) {
    const phone = body.phoneNumber;
    const forwardedFor = req.headers['x-forwarded-for'];
    const firstForwardedIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(',')[0]
      ?.trim();
    const realIpHeader = req.headers['x-real-ip'];
    const realIp = (Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader)?.trim();
    return this.otpService.send(phone, firstForwardedIp || realIp || req.ip || '127.0.0.1');
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PinVerifyRateLimitGuard)
  verify(@Body() body: Record<string, unknown> | undefined) {
    const phone = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
    const code = typeof body?.code === 'string' ? body.code : '';
    return this.otpService.verify(phone, code);
  }
}
