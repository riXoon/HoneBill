import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletFundingService } from './wallet-funding.service.js';
import { WalletService } from './wallet.util.js';
import { ApiThrottlerGuard } from '../../common/guards/api-throttler.guard.js';
import { FundWalletDto } from './dto/fund-wallet.dto.js';
import { ConfirmTransferDto } from './dto/confirm-transfer.dto.js';

@Controller()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly funding: WalletFundingService,
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
  getHistory(
    @Query('shortId') shortId?: string,
    @Query('publicKey') publicKey?: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.walletService.getHistory(shortId, publicKey, limit, since);
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
  getTransactions(
    @Query('shortId') shortId: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.walletService.getTransactions(shortId ?? '', Number(limit ?? 50), since);
  }

  @Post('wallet/moves/confirm')
  confirmMove(@Body() body: ConfirmTransferDto) {
    return this.walletService.confirmMove(body.txHash);
  }

  @Post('wallet/transfers/confirm')
  confirmTransfer(@Body() body: ConfirmTransferDto) {
    return this.walletService.confirmTransfer(body.txHash);
  }
}
