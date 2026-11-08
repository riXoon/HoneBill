import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { NoFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AnchorService } from './anchor.service.js';
import {
  ConfirmWithdrawalRequestDto,
  InteractiveRampRequestDto,
  SimulatePaymentRequestDto,
  SubmitWithdrawalRequestDto,
} from './dto/anchor-requests.dto.js';

@Controller()
/** Maps the standard Stellar well-known path and the anchor's SEP-24 API paths to the service. */
export class AnchorController {
  constructor(private readonly anchorService: AnchorService) {}

  @Get('.well-known/stellar.toml')
  /** Serves dynamically generated anchor metadata as plain text at the SEP-1 well-known URL. */
  stellarToml(@Res() response: Response): void {
    const result = this.anchorService.stellarToml();
    response.status(result.status).set(result.headers).send(result.body);
  }

  @Get('sep24/info')
  /** Publishes supported assets, ramp availability, and transaction caps for wallet discovery. */
  sep24Info(@Res() response: Response): void {
    response
      .status(200)
      .set({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      })
      .json(this.anchorService.sep24Info());
  }

  @Get('sep24/transaction')
  /** Returns a SEP-24 transaction's current status after the service validates its owner. */
  async sep24Transaction(
    @Headers('authorization') authorization: string | undefined,
    @Query('id') id: string | undefined,
  ) {
    return this.anchorService.sep24Transaction(authorization, id);
  }

  @Post('sep24/transactions/deposit/interactive')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(NoFilesInterceptor())
  /** Creates a deposit transaction and returns a short-lived webview URL token. */
  initiateDeposit(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: InteractiveRampRequestDto,
  ) {
    return this.anchorService.initiateDeposit(authorization, body);
  }

  @Post('sep24/transactions/withdraw/interactive')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(NoFilesInterceptor())
  /** Creates a withdrawal transaction and returns a short-lived webview URL token. */
  initiateWithdrawal(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: InteractiveRampRequestDto,
  ) {
    return this.anchorService.initiateWithdrawal(authorization, body);
  }

  @Post('anchor/submit-withdraw')
  @HttpCode(HttpStatus.OK)
  submitWithdrawal(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('x-real-ip') realIp: string | undefined,
    @Body() body: SubmitWithdrawalRequestDto,
  ) {
    return this.anchorService.submitWithdrawal(authorization, body, forwardedFor ?? realIp);
  }

  @Post('anchor/confirm-withdraw')
  @HttpCode(HttpStatus.OK)
  confirmWithdrawal(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('x-real-ip') realIp: string | undefined,
    @Body() body: ConfirmWithdrawalRequestDto,
  ) {
    return this.anchorService.confirmWithdrawal(authorization, body, forwardedFor ?? realIp);
  }

  @Post('anchor/simulate-payment')
  @HttpCode(HttpStatus.OK)
  simulatePayment(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Headers('x-real-ip') realIp: string | undefined,
    @Body() body: SimulatePaymentRequestDto,
  ) {
    return this.anchorService.simulatePayment(authorization, body, forwardedFor ?? realIp);
  }
}
