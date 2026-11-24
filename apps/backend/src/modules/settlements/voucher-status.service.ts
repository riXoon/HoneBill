import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { userFailureReason } from '../engine/settlement-notice.util.js';
import { smsVoucherKey } from '../sms/sms.constants.js';

type Status = { nonce: string; status: 'NOT_FOUND' | 'PENDING' | 'SETTLED' | 'FAILED'; txHash?: string; reason?: string };

@Injectable()
export class VoucherStatusService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async lookup(publicKey: string, nonces: string[]): Promise<Status[]> {
    const account = await this.prisma.account.findUnique({ where: { stellarPublicKey: publicKey }, select: { shortId: true } });
    if (!account) throw new NotFoundException('Wallet account not found');
    const normalized = [...new Set(nonces.map((nonce) => Buffer.from(nonce, 'base64').toString('base64')))];
    const spellings = [...new Set([...nonces, ...normalized.flatMap((nonce) => {
      const url = nonce.replace(/\+/g, '-').replace(/\//g, '_');
      return [nonce, nonce.slice(0, -1), url, url.slice(0, -1)];
    })])];
    const rows = await this.prisma.settlement.findMany({
      where: { nonce: { in: spellings }, OR: [{ senderShortId: account.shortId }, { receiverShortId: account.shortId }] },
      select: { nonce: true, status: true, txHash: true, failReason: true },
    });
    const byNonce = new Map(rows.map((row) => [Buffer.from(row.nonce, 'base64').toString('base64'), row]));
    const missing = normalized.filter((nonce) => !byNonce.has(nonce));
    const markers = missing.length ? await this.redis.getClient().mget(...missing.map(smsVoucherKey)) : [];
    // The ingress marker carries only the sender ID until the worker verifies the signature and records a settlement.
    const queued = new Set(missing.filter((_nonce, index) => markers[index] === account.shortId));
    return nonces.map((nonce) => {
      const canonical = Buffer.from(nonce, 'base64').toString('base64');
      const row = byNonce.get(canonical);
      if (!row) return { nonce, status: queued.has(canonical) ? 'PENDING' : 'NOT_FOUND' };
      return { nonce, status: row.status, ...(row.txHash ? { txHash: row.txHash } : {}),
        ...(row.status === 'FAILED' ? { reason: userFailureReason(row.failReason) } : {}) };
    });
  }
}
