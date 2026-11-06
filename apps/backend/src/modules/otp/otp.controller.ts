import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OtpService } from './otp.service.js';
import { PinVerifyRateLimitGuard } from '../../common/guards/pin-verify-rate-limit.guard.js';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';

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
  verify(@Body() body: VerifyOtpDto) {
    return this.otpService.verify(body.phoneNumber, body.code);
  }
}
