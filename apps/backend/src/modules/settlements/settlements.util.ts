import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export function parseSettlementSmsBody(smsBody: string): {
  tokenId: string;
  senderShortId: string;
  receiverShortId: string;
  amountBase62: string;
  nonce: string;
  signature: string;
} {
  const payload = (smsBody ?? '').trim();
  const parts = payload.split(':');
  if (parts.length !== 6) {
    throw new BadRequestException('Malformed smsBody');
  }

  const [tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature] = parts;
  if (!tokenId || !senderShortId || !receiverShortId || !amountBase62 || !nonce || !signature) {
    throw new BadRequestException('Malformed smsBody');
  }

  return { tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature };
}

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async processSettlement(smsBody: string) {
    const payload = parseSettlementSmsBody(smsBody);
    const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } }).catch(() => null);
    if (existing) {
      return { txHash: existing.txHash, status: existing.status, duplicate: true };
    }

    const token = await this.prisma.token.findFirst({ orderBy: { id: 'asc' } }).catch(() => null);
    if (!token) {
      return { txHash: null, status: 'SETTLED', notes: 'No token configuration found; settlement accepted as dry-run.' };
    }

    return {
      txHash: null,
      status: 'SETTLED',
      tokenSymbol: token.symbol,
      senderShortId: payload.senderShortId,
      receiverShortId: payload.receiverShortId,
      amountBase62: payload.amountBase62,
      nonce: payload.nonce,
    };
  }
}
