import { Injectable } from '@nestjs/common';
import { isPlausiblePhone, toDbPhone } from '../../common/utils/phone.util.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { formatVoucherAmount } from '../engine/settlement-notice.util.js';
import { withinSettlementDeadline } from '../settlements/settlement-rpc-deadline.js';

type VaultToken = { contractId: string; symbol: string; decimals: number };

export const BALANCE_SMS_COMMAND = '/check-balance';
export const BALANCE_SMS_UNAVAILABLE = 'HoneBill: Your offline balance is unavailable right now. Please try again.';
const BALANCE_CHECK_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

@Injectable()
export class SmsBalanceService {
  constructor(private readonly prisma: PrismaService, private readonly stellar: StellarService) {}

  async replyForPhone(phone: string): Promise<string> {
    return withinSettlementDeadline(async () => {
      const account = await this.accountForPhone(phone);
      if (!account) return 'HoneBill: Use the phone number registered to your HoneBill account to check your offline balance.';

      const token = await this.prisma.token.findUnique({ where: { symbol: 'PHPC' } });
      if (!token?.isActive) return BALANCE_SMS_UNAVAILABLE;
      return `HoneBill: ${await this.readBalance(account.stellarPublicKey, token)}`;
    }, Date.now() + 3_000);
  }

  async receiptBalance(phone: string, publicKey: string, token: VaultToken): Promise<string | null> {
    return withinSettlementDeadline(async () => {
      const account = await this.accountForPhone(phone);
      return account?.stellarPublicKey === publicKey ? this.readBalance(publicKey, token) : null;
    }, Date.now() + 3_000);
  }

  private async accountForPhone(phone: string) {
    if (!/^\+?[\d ().-]+$/.test(phone) || !isPlausiblePhone(phone)) return null;
    const accounts = await this.prisma.account.findMany({
      where: { phoneNumber: toDbPhone(phone) },
      select: { stellarPublicKey: true },
      take: 2,
    });
    return accounts.length === 1 ? accounts[0] : null;
  }

  private async readBalance(publicKey: string, token: VaultToken): Promise<string> {
    const contract = await this.stellar.getContract();
    const { result } = await contract.get_vault({ user: publicKey, token: token.contractId });
    const amount = formatVoucherAmount(result, token.symbol, token.decimals);
    const checkedAt = BALANCE_CHECK_TIME.format(new Date());
    return `Offline balance: ${amount} as of ${checkedAt} PHT.`;
  }
}
