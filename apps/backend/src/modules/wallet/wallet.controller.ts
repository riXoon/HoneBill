import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { WalletFundingService } from './wallet-funding.service.js';
import { WalletService } from './wallet.util.js';
import { WalletConfirmationService } from './wallet-confirmation.service.js';
import { Sep10JwtGuard } from '../../common/guards/sep10-jwt.guard.js';
import { FundWalletDto } from './dto/fund-wallet.dto.js';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto.js';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly funding: WalletFundingService,
    private readonly confirmation: WalletConfirmationService,
  ) {}

  /** Puts a registered wallet on the ledger (XLM reserve only) so SEP-10 and trustlines work. Safe to repeat. */
  @Post('wallet/fund')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  fund(@Body() body: FundWalletDto) {
    return this.funding.fund(body.publicKey);
  }

  @Get('wallet/balance')
  @Throttle({ default: { limit: 10, ttl: 10_000 } })
  getBalance(@Query('publicKey') publicKey: string, @Query('assetCode') assetCode: string) {
    return this.walletService.getBalance(publicKey ?? '', assetCode ?? '');
  }

  @Get('wallet/history')
  @Throttle({ default: { limit: 10, ttl: 10_000 } })
  @UseGuards(Sep10JwtGuard)
  @Header('Cache-Control', 'private, no-store')
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Query('shortId') shortId?: unknown,
    @Query('publicKey') publicKey?: unknown,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.walletService.getHistory(request.user.sub, { shortId, publicKey, limit, since });
  }

  @Get('vault-balance')
  getVaultBalance(
    @Query('shortId') shortId?: string,
    @Query('stellarPublicKey') stellarPublicKey?: string,
    @Query('publicKey') publicKey?: string,
  ) {
    return this.walletService.getVaultBalance(shortId, stellarPublicKey ?? publicKey);
  }

  @Get('transactions')
  @Throttle({ default: { limit: 15, ttl: 10_000 } })
  @UseGuards(Sep10JwtGuard)
  @Header('Cache-Control', 'private, no-store')
  getTransactions(
    @Req() request: AuthenticatedRequest,
    @Query('shortId') shortId?: unknown,
    @Query('publicKey') publicKey?: unknown,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.walletService.getTransactions(request.user.sub, {
      shortId: typeof shortId === 'string' ? shortId.trim() : shortId,
      publicKey,
      limit,
      since,
    });
  }

  @Post('wallet/moves/confirm')
  @UseGuards(Sep10JwtGuard)
  @Header('Cache-Control', 'private, no-store')
  confirmMove(@Req() request: AuthenticatedRequest, @Body() body: ConfirmTransferDto) {
    return this.confirmation.confirm('move', request.user.sub, body.txHash);
  }

  @Post('wallet/transfers/confirm')
  @UseGuards(Sep10JwtGuard)
  @Header('Cache-Control', 'private, no-store')
  confirmTransfer(@Req() request: AuthenticatedRequest, @Body() body: ConfirmTransferDto) {
    return this.confirmation.confirm('transfer', request.user.sub, body.txHash);
  }
}
