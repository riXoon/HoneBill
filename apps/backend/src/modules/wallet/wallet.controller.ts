import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalletService } from './wallet.util.js';
import { ApiThrottlerGuard } from '../../common/guards/api-throttler.guard.js';

@Controller()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

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

  @Post('wallet/transfers/confirm')
  confirmTransfer(@Body() body: { txHash?: string }) {
    return this.walletService.confirmTransfer(body?.txHash ?? '');
  }
}
