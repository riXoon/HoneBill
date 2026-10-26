import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';

export const ASSET_ISSUERS: Record<string, string> = {
  PHPC: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY',
  USDC: 'GDQGJU5JTW5IFCGS6JZTIGK57IKPW4N4LJWWEN7F3K3GSEJEYPVJ3BYA',
};

export function normalizeAssetCode(assetCode?: string): string {
  const normalized = (assetCode ?? '').trim().toUpperCase();
  if (!normalized) {
    throw new BadRequestException('Missing required query parameter: assetCode');
  }
  if (!ASSET_ISSUERS[normalized]) {
    throw new BadRequestException(
      `Unsupported asset code: '${normalized}'. Supported assets: ${Object.keys(ASSET_ISSUERS).join(', ')}`,
    );
  }
  return normalized;
}

export function isValidStellarPublicKey(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

export function stroopsToDecimalString(stroops: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals);
  const whole = stroops / divisor;
  const remainder = stroops % divisor;
  const fraction = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function buildTransactionHistory(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...items]
    .sort((left, right) => {
      const leftTime = new Date(
        String((left.timestamp as string | undefined) ?? (left.createdAt as string | undefined) ?? 0),
      ).getTime();
      const rightTime = new Date(
        String((right.timestamp as string | undefined) ?? (right.createdAt as string | undefined) ?? 0),
      ).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 50);
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async getBalance(publicKey: string, assetCode: string) {
    const key = publicKey.trim();
    if (!key) {
      throw new BadRequestException('Missing required query parameter: publicKey');
    }
    if (!isValidStellarPublicKey(key)) {
      throw new BadRequestException('Invalid Stellar public key format.');
    }
    const normalizedAsset = normalizeAssetCode(assetCode);

    try {
      const account = await this.stellar.horizonServer.loadAccount(key);
      const issuer = ASSET_ISSUERS[normalizedAsset];
      const trustlineBalance = account.balances.find((balance: any) => {
        return balance.asset_type !== 'native' && balance.asset_code === normalizedAsset && balance.asset_issuer === issuer;
      });
      return { balance: trustlineBalance ? trustlineBalance.balance : '0.00' };
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return { balance: '0.00' };
      }
      throw new BadGatewayException('Failed to load account from Stellar network.');
    }
  }

  async getHistory(shortId?: string, publicKey?: string) {
    const conditions: Array<Record<string, unknown>> = [];
    if (shortId) {
      conditions.push({ senderShortId: shortId });
      conditions.push({ receiverShortId: shortId });
    }
    if (publicKey) {
      conditions.push({ senderPublicKey: publicKey });
      conditions.push({ recipientPublicKey: publicKey });
    }

    const settlements = await this.prisma.settlement.findMany({
      where: conditions.length ? { OR: conditions } : undefined,
      include: { token: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const onlineTransfers = await this.prisma.onlineTransfer.findMany({
      where: conditions.length ? { OR: conditions } : undefined,
      include: { token: true },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const anchorTransactions = await this.prisma.anchorTransaction.findMany({
      where: publicKey ? { stellarAccount: publicKey } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const transactions = buildTransactionHistory([
      ...settlements.map((item: any) => ({
        id: String(item.id),
        type: item.senderShortId === shortId ? 'SEND' : 'RECEIVE',
        tag: 'OFFLINE',
        title: item.senderShortId === shortId ? `Sent to ${item.receiverShortId}` : `Received from ${item.senderShortId}`,
        amount: item.senderShortId === shortId ? `-${stroopsToDecimalString(item.amountStroops)}` : stroopsToDecimalString(item.amountStroops),
        assetCode: item.token?.symbol ?? 'PHPC',
        status: item.status,
        timestamp: item.createdAt.toISOString(),
      })),
      ...onlineTransfers.map((item: any) => ({
        id: item.txHash,
        type: item.senderPublicKey === publicKey ? 'SEND' : 'RECEIVE',
        tag: 'WALLET',
        title: item.senderPublicKey === publicKey ? `Sent to ${item.recipientPublicKey.slice(0, 8)}` : `Received from ${item.senderPublicKey.slice(0, 8)}`,
        amount: item.senderPublicKey === publicKey ? `-${stroopsToDecimalString(item.amountStroops)}` : stroopsToDecimalString(item.amountStroops),
        assetCode: item.token?.symbol ?? 'PHPC',
        status: item.status,
        timestamp: item.createdAt.toISOString(),
      })),
      ...anchorTransactions.map((item: any) => ({
        id: item.id,
        type: item.type === 'deposit' ? 'TRANSFER' : 'WITHDRAWAL',
        tag: 'WALLET',
        title: item.type === 'deposit' ? 'Deposit' : 'Withdrawal',
        amount:
          item.type === 'deposit'
            ? stroopsToDecimalString(BigInt(String(Number(item.amountOut ?? 0) * 10_000_000)))
            : `-${stroopsToDecimalString(BigInt(String(Number(item.amountOut ?? 0) * 10_000_000)))}`,
        assetCode: item.assetCode,
        status: item.status,
        timestamp: item.createdAt.toISOString(),
      })),
    ]);

    return { transactions };
  }

  async getVaultBalance(shortId?: string, publicKey?: string) {
    if (!shortId && !publicKey) {
      throw new BadRequestException("Please provide either 'shortId' or 'stellarPublicKey' query parameter");
    }

    if (publicKey && !isValidStellarPublicKey(publicKey)) {
      throw new BadRequestException('Invalid Stellar Public Key format');
    }

    if (shortId) {
      const account = await this.prisma.account.findUnique({ where: { shortId } });
      if (!account) {
        throw new NotFoundException(`Account not found for Short ID: ${shortId}`);
      }
      return {
        success: true,
        stellarPublicKey: account.stellarPublicKey,
        shortId,
        balanceStroops: '0',
        balancePHP: 0,
      };
    }

    return {
      success: true,
      stellarPublicKey: publicKey,
      shortId: null,
      balanceStroops: '0',
      balancePHP: 0,
    };
  }

  async getTransactions(shortId: string, limit = 50) {
    const normalizedShortId = shortId.trim();
    if (!normalizedShortId) {
      throw new BadRequestException('shortId query parameter is required');
    }

    const actualLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const settlements = await this.prisma.settlement.findMany({
      where: {
        OR: [{ senderShortId: normalizedShortId }, { receiverShortId: normalizedShortId }],
        status: 'SETTLED',
      },
      include: { token: true },
      orderBy: { createdAt: 'desc' },
      take: actualLimit,
    });

    return {
      success: true,
      data: settlements.map((item: any) => ({
        ...item,
        amountStroops: item.amountStroops.toString(),
      })),
    };
  }

  async confirmTransfer(txHash: string) {
    const normalizedTxHash = txHash.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedTxHash)) {
      throw new BadRequestException('txHash must be a 64-character hexadecimal string');
    }

    const transfer = await this.prisma.onlineTransfer.findUnique({ where: { txHash: normalizedTxHash } });
    if (!transfer) {
      throw new NotFoundException('Unknown online transfer');
    }

    return {
      txHash: normalizedTxHash,
      status: transfer.status,
      confirmedAt: transfer.confirmedAt,
    };
  }
}
