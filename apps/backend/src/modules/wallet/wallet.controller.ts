import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.util.js';
import { LegacyThrottlerGuard } from '../../common/guards/legacy-throttler.guard.js';

@Controller()
@UseGuards(LegacyThrottlerGuard) // applies to every route in this controller
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('wallet/balance')
  getBalance(@Query('publicKey') publicKey: string, @Query('assetCode') assetCode: string) {
    return this.walletService.getBalance(publicKey ?? '', assetCode ?? '');
  }

  @Get('wallet/history')
  getHistory(@Query('shortId') shortId?: string, @Query('publicKey') publicKey?: string) {
    return this.walletService.getHistory(shortId, publicKey);
  }

  @Get('vault-balance')
  getVaultBalance(@Query('shortId') shortId?: string, @Query('publicKey') publicKey?: string) {
    return this.walletService.getVaultBalance(shortId, publicKey);
  }

  @Get('transactions')
  getTransactions(@Query('shortId') shortId: string, @Query('limit') limit?: string) {
    return this.walletService.getTransactions(shortId ?? '', Number(limit ?? 50));
  }

  @Post('wallet/transfers/confirm')
  confirmTransfer(@Body() body: { txHash?: string }) {
    return this.walletService.confirmTransfer(body?.txHash ?? '');
  }
}
