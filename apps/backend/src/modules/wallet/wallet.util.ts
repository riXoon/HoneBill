import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';

/**
 * Issuer of each supported asset. PHPC's comes from `PHPC_ISSUER_PUBKEY`, the same setting the anchor pays out
 * with, so balances are read from the asset users are actually paid in. The fallback is the original testnet issuer.
 * A getter, so the value is read when used, after the config file has been loaded.
 */
const LEGACY_PHPC_ISSUER = 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY';

export const ASSET_ISSUERS: Record<string, string> = {
  get PHPC() {
    return process.env.PHPC_ISSUER_PUBKEY?.trim() || LEGACY_PHPC_ISSUER;
  },
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
  return /^G[A-Z2-7]{55}$/.test((value ?? '').trim());
}

export function stroopsToDecimalString(stroops: bigint, decimals = 7): string {
  const divisor = BigInt(10 ** decimals);
  const whole = stroops / divisor;
  const remainder = stroops % divisor;
  const fraction = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function normalizeLimit(rawLimit?: string | number): number {
  return Math.min(Math.max(Number(rawLimit) || 50, 1), 100);
}

export function buildTransactionHistory(items: Array<Record<string, unknown>>, limit = 50): Array<Record<string, unknown>> {
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
    .slice(0, limit);
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async getBalance(publicKey: string, assetCode: string) {
    const key = (publicKey ?? '').trim();
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

  async getHistory(shortId?: string, publicKey?: string, limitParam?: string, sinceParam?: string) {
    if (!shortId || !publicKey) {
      const missing = [!shortId && 'shortId', !publicKey && 'publicKey'].filter(Boolean).join(', ');
      throw new BadRequestException(`Missing required parameter(s): ${missing}`);
    }

    const limit = normalizeLimit(limitParam);
    const sinceDate = sinceParam ? new Date(sinceParam) : null;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;
    const dateFilter = validSince ? { gte: validSince } : undefined;

    try {
      const [settlements, anchorTransactions, onlineTransfers, walletMoves] = await Promise.all([
        this.prisma.settlement.findMany({
          where: {
            OR: [{ senderShortId: shortId }, { receiverShortId: shortId }],
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          include: { token: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        this.prisma.anchorTransaction.findMany({
          where: {
            stellarAccount: publicKey,
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        this.prisma.onlineTransfer.findMany({
          where: {
            OR: [{ senderPublicKey: publicKey }, { recipientPublicKey: publicKey }],
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          include: { token: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        // Moves between the user's own wallets: only the ones the ledger has confirmed.
        this.prisma.walletMove?.findMany
          ? this.prisma.walletMove.findMany({
              where: {
                accountPublicKey: publicKey,
                status: 'SETTLED',
                ...(dateFilter ? { createdAt: dateFilter } : {}),
              },
              include: { token: true },
              orderBy: { createdAt: 'desc' },
              take: limit,
            })
          : Promise.resolve([] as any[]),
      ]);

      const shortIds = [...new Set(settlements.flatMap((item: any) => [item.senderShortId, item.receiverShortId]))];
      const publicKeys = [...new Set(onlineTransfers.flatMap((item: any) => [item.senderPublicKey, item.recipientPublicKey]))];
      const accounts = this.prisma.account?.findMany
        ? await this.prisma.account.findMany({
            where: { OR: [{ shortId: { in: shortIds } }, { stellarPublicKey: { in: publicKeys } }] },
            select: { shortId: true, stellarPublicKey: true, firstName: true },
          })
        : [];

      const byShortId = new Map(accounts.map((item: any) => [item.shortId, item.firstName || item.shortId]));
      const byPublicKey = new Map(accounts.map((item: any) => [item.stellarPublicKey, item.firstName || `${item.stellarPublicKey.slice(0, 6)}...${item.stellarPublicKey.slice(-4)}`]));

      const settlementItems = settlements.map((item: any) => {
        const sender = item.senderShortId === shortId;
        const amount = stroopsToDecimalString(item.amountStroops, item.token?.decimals ?? 7);
        return {
          id: String(item.id),
          type: sender ? 'SEND' : 'RECEIVE',
          tag: 'OFFLINE',
          title: sender ? `Sent to ${byShortId.get(item.receiverShortId) ?? item.receiverShortId}` : `Received from ${byShortId.get(item.senderShortId) ?? item.senderShortId}`,
          amount: sender ? `-${amount}` : amount,
          assetCode: item.token?.symbol ?? 'PHPC',
          status: item.status,
          timestamp: item.createdAt.toISOString(),
          ...(item.txHash ? { txHash: item.txHash } : {}),
          ...(item.nonce ? { nonce: item.nonce } : {}),
        };
      });

      const anchorItems = anchorTransactions.map((item: any) => {
        const deposit = item.type === 'deposit';
        const amount = item.amountOut ?? item.amountIn ?? '0';
        return {
          id: item.id,
          type: deposit ? 'TRANSFER' : 'WITHDRAWAL',
          tag: 'WALLET',
          title: deposit ? 'Wallet Transfer' : 'Wallet Withdrawal',
          amount: deposit ? amount : `-${amount}`,
          assetCode: item.assetCode,
          status: item.status,
          timestamp: item.createdAt.toISOString(),
        };
      });

      const transferItems = onlineTransfers.map((item: any) => {
        const sender = item.senderPublicKey === publicKey;
        const amount = stroopsToDecimalString(item.amountStroops, item.token?.decimals ?? 7);
        return {
          id: item.id ? (String(item.id).startsWith('online:') ? String(item.id) : `online:${item.id}`) : (item.txHash ?? ''),
          type: sender ? 'SEND' : 'RECEIVE',
          tag: 'WALLET',
          title: sender
            ? `Sent to ${byPublicKey.get(item.recipientPublicKey) ?? (item.recipientPublicKey ? `${item.recipientPublicKey.slice(0, 6)}...${item.recipientPublicKey.slice(-4)}` : '')}`
            : `Received from ${byPublicKey.get(item.senderPublicKey) ?? (item.senderPublicKey ? `${item.senderPublicKey.slice(0, 6)}...${item.senderPublicKey.slice(-4)}` : '')}`,
          amount: sender ? `-${amount}` : amount,
          assetCode: item.token?.symbol ?? 'UNKNOWN',
          status: item.status,
          timestamp: (item.confirmedAt ?? item.createdAt).toISOString(),
          txHash: item.txHash,
        };
      });

      // One move is two entries, one per wallet it touches, so each wallet's view can list its own side.
      // `mirror` marks the credit side, which History's combined list leaves out so the move shows once.
      const moveItems = walletMoves.flatMap((item: any) => {
        const toOffline = item.direction === 'TO_OFFLINE';
        const amount = stroopsToDecimalString(item.amountStroops, item.token?.decimals ?? 7);
        const base = {
          assetCode: item.token?.symbol ?? 'PHPC',
          status: item.status,
          timestamp: (item.confirmedAt ?? item.createdAt).toISOString(),
          txHash: item.txHash,
        };
        return [
          {
            ...base,
            id: `move:${item.id}:out`,
            type: 'MOVE',
            tag: toOffline ? 'WALLET' : 'OFFLINE',
            title: toOffline ? 'Transferred to Offline Balance' : 'Transferred to Online Balance',
            amount: `-${amount}`,
          },
          {
            ...base,
            id: `move:${item.id}:in`,
            type: 'MOVE',
            tag: toOffline ? 'OFFLINE' : 'WALLET',
            title: toOffline ? 'Received from Online Balance' : 'Received from Offline Balance',
            amount,
            mirror: true,
          },
        ];
      });

      return {
        transactions: buildTransactionHistory([...settlementItems, ...anchorItems, ...transferItems, ...moveItems], limit),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadGatewayException('Failed to fetch transaction history.');
    }
  }

  async getVaultBalance(shortId?: string, publicKey?: string) {
    const keyParam = (publicKey ?? '').trim();
    const sId = (shortId ?? '').trim();

    if (!sId && !keyParam) {
      throw new BadRequestException("Please provide either 'shortId' or 'stellarPublicKey' query parameter");
    }

    let stellarPublicKey = '';
    let shortIdFound: string | null = null;

    if (sId) {
      const account = await this.prisma.account.findUnique({ where: { shortId: sId } });
      if (!account) {
        throw new NotFoundException(`Account not found for Short ID: ${sId}`);
      }
      stellarPublicKey = account.stellarPublicKey;
      shortIdFound = account.shortId;
    } else {
      if (!isValidStellarPublicKey(keyParam)) {
        throw new BadRequestException('Invalid Stellar Public Key format');
      }
      stellarPublicKey = keyParam;
      const account = await this.prisma.account.findUnique({ where: { stellarPublicKey } });
      if (account) {
        shortIdFound = account.shortId;
      }
    }

    // Online balance from Horizon
    let balanceStroops = 0n;
    let balancePHP = 0;
    try {
      const account = await this.stellar.horizonServer.loadAccount(stellarPublicKey);
      const issuer = ASSET_ISSUERS.PHPC;
      const trustlineBalance = account.balances.find((b: any) => {
        return (
          (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
          b.asset_code === 'PHPC' &&
          b.asset_issuer === issuer
        );
      });
      if (trustlineBalance) {
        const [wholePart, fracPart = ''] = trustlineBalance.balance.split('.');
        const paddedFrac = fracPart.padEnd(7, '0').slice(0, 7);
        balanceStroops = BigInt(wholePart) * 10_000_000n + BigInt(paddedFrac);
        balancePHP = parseFloat(trustlineBalance.balance);
      }
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        throw new BadGatewayException('Failed to read balance from Stellar network.');
      }
    }

    // Offline vault balance from Soroban
    let offlineBalanceStroops = 0n;
    let offlineBalancePHP = 0;
    try {
      const phpcToken = await this.prisma.token.findUnique({
        where: { symbol: 'PHPC' },
        select: { contractId: true, isActive: true },
      });
      if (!phpcToken?.isActive) {
        throw new BadGatewayException('PHPC token is not configured or is inactive.');
      }
      const contract = await this.stellar.getContract();
      const vaultTx = await contract.get_vault({
        user: stellarPublicKey,
        token: phpcToken.contractId,
      });
      offlineBalanceStroops = BigInt(vaultTx.result ?? 0);
      offlineBalancePHP = Number(offlineBalanceStroops) / 10_000_000;
    } catch (err: any) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException('Failed to read offline vault balance from Stellar network.');
    }

    return {
      success: true,
      stellarPublicKey,
      shortId: shortIdFound,
      balanceStroops: balanceStroops.toString(),
      balancePHP,
      offlineBalanceStroops: offlineBalanceStroops.toString(),
      offlineBalancePHP,
    };
  }

  async getTransactions(shortId: string, limit = 50, since?: string) {
    const normalizedShortId = (shortId ?? '').trim();
    if (!normalizedShortId) {
      throw new BadRequestException('shortId query parameter is required');
    }

    const requestedLimit = normalizeLimit(limit);
    const sinceDate = since ? new Date(since) : null;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;
    const dateFilter = validSince ? { gte: validSince } : undefined;

    const settlements = await this.prisma.settlement.findMany({
      where: {
        OR: [{ senderShortId: normalizedShortId }, { receiverShortId: normalizedShortId }],
        status: 'SETTLED',
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: { token: { select: { symbol: true, decimals: true } } },
      orderBy: { createdAt: 'desc' },
      take: requestedLimit,
    });

    const shortIdsToFetch = new Set<string>();
    settlements.forEach((s: any) => {
      if (s.senderShortId) shortIdsToFetch.add(s.senderShortId);
      if (s.receiverShortId) shortIdsToFetch.add(s.receiverShortId);
    });

    const accounts = this.prisma.account?.findMany
      ? await this.prisma.account.findMany({
          where: { shortId: { in: Array.from(shortIdsToFetch) } },
          select: { shortId: true, firstName: true },
        })
      : [];

    const accountMap = new Map<string, string>();
    accounts.forEach((acc: any) => {
      accountMap.set(acc.shortId, acc.firstName || acc.shortId);
    });

    const serialized = settlements.map((s: any) => ({
      ...s,
      amountStroops: s.amountStroops.toString(),
      senderName: accountMap.get(s.senderShortId) || s.senderShortId,
      receiverName: accountMap.get(s.receiverShortId) || s.receiverShortId,
    }));

    return {
      success: true,
      data: serialized,
    };
  }

  /** Marks a move between the user's own wallets SETTLED once the ledger has applied it. Same contract as `confirmTransfer`. */
  async confirmMove(txHash: string) {
    const normalizedTxHash = (txHash ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedTxHash)) {
      throw new BadRequestException('txHash must be a 64-character hexadecimal string');
    }

    const move = await this.prisma.walletMove.findUnique({ where: { txHash: normalizedTxHash } });
    if (!move) throw new NotFoundException('Unknown wallet move');
    if (move.status === 'SETTLED') {
      return { txHash: normalizedTxHash, status: move.status, confirmedAt: move.confirmedAt };
    }

    try {
      const chainTx: any = await this.stellar.sorobanServer.getTransaction(normalizedTxHash);
      if (chainTx.status === 'NOT_FOUND') {
        throw new ApiResponseException(409, {
          txHash: normalizedTxHash,
          status: 'PENDING',
          error: 'Transaction has not reached the RPC history window yet',
        });
      }
      if (chainTx.status === 'FAILED') {
        const failed = await this.prisma.walletMove.update({ where: { txHash: normalizedTxHash }, data: { status: 'FAILED' } });
        throw new ApiResponseException(422, { txHash: normalizedTxHash, status: failed.status });
      }
      const settled = await this.prisma.walletMove.update({
        where: { txHash: normalizedTxHash },
        data: { status: 'SETTLED', confirmedAt: new Date() },
      });
      return { txHash: normalizedTxHash, status: settled.status, confirmedAt: settled.confirmedAt };
    } catch (error: any) {
      if (error instanceof ApiResponseException) throw error;
      throw new BadGatewayException('Unable to verify transaction with Soroban RPC');
    }
  }

  async confirmTransfer(txHash: string) {
    const normalizedTxHash = (txHash ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedTxHash)) {
      throw new BadRequestException('txHash must be a 64-character hexadecimal string');
    }

    const transfer = await this.prisma.onlineTransfer.findUnique({
      where: { txHash: normalizedTxHash },
    });
    if (!transfer) {
      throw new NotFoundException('Unknown online transfer');
    }

    if (transfer.status === 'SETTLED') {
      return {
        txHash: normalizedTxHash,
        status: transfer.status,
        confirmedAt: transfer.confirmedAt,
      };
    }

    try {
      const chainTx = await this.stellar.sorobanServer.getTransaction(normalizedTxHash);

      if (chainTx.status === rpc.Api.GetTransactionStatus.NOT_FOUND || (chainTx as any).status === 'NOT_FOUND') {
        throw new ApiResponseException(409, {
          txHash: normalizedTxHash,
          status: 'PENDING',
          error: 'Transaction has not reached the RPC history window yet',
        });
      }

      if (chainTx.status === rpc.Api.GetTransactionStatus.FAILED || (chainTx as any).status === 'FAILED') {
        const failed = await this.prisma.onlineTransfer.update({
          where: { txHash: normalizedTxHash },
          data: { status: 'FAILED' },
        });
        throw new ApiResponseException(422, {
          txHash: normalizedTxHash,
          status: failed.status,
        });
      }

      const settled = await this.prisma.onlineTransfer.update({
        where: { txHash: normalizedTxHash },
        data: { status: 'SETTLED', confirmedAt: new Date() },
      });

      return {
        txHash: normalizedTxHash,
        status: settled.status,
        confirmedAt: settled.confirmedAt,
      };
    } catch (error: any) {
      if (error instanceof ApiResponseException) throw error;
      throw new BadGatewayException('Unable to verify transaction with Soroban RPC');
    }
  }
}
