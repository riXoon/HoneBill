import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Address, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { LegacyBodyException } from '../../common/exceptions/legacy-body.exception.js';
import { StellarTransactionManager } from '../engine/stellar-transaction-manager.service.js';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const I128_MAX = (1n << 127n) - 1n;

export function decodeBase62(value: string): bigint {
  if (!value) throw new BadRequestException('Amount encoding is empty');
  let result = 0n;
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new BadRequestException(`Invalid Base62 character: '${character}'`);
    result = result * 62n + BigInt(digit);
  }
  return result;
}

export function restorePadding(value: string): string {
  return value + '='.repeat((4 - (value.length % 4)) % 4);
}

export function buildOfflineSignatureXdr(input: {
  amountStroops: bigint; protocolToll: bigint; nonce: Buffer; receiverShortId: string;
  gatewayPublicKey: string; tokenContractId: string; contractId?: string;
}): Buffer {
  const tuple = [
    nativeToScVal(input.amountStroops, { type: 'i128' }), nativeToScVal(input.protocolToll, { type: 'i128' }),
    xdr.ScVal.scvBytes(input.nonce), xdr.ScVal.scvBytes(Buffer.from(input.receiverShortId, 'ascii')),
    Address.fromString(input.gatewayPublicKey).toScVal(), Address.fromString(input.tokenContractId).toScVal(),
  ];
  if (input.contractId) tuple.push(Address.fromString(input.contractId).toScVal());
  return Buffer.from(xdr.ScVal.scvVec(tuple).toXDR());
}

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
    throw new BadRequestException(`Malformed SMS payload: expected 6 parts, got ${parts.length}`);
  }

  const [tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature] = parts;
  if (!tokenId || !senderShortId || !receiverShortId || !amountBase62 || !nonce || !signature) {
    throw new BadRequestException('Malformed smsBody');
  }

  if (!/^\d+$/.test(tokenId) || !Number.isSafeInteger(Number(tokenId)) || Number(tokenId) <= 0) throw new BadRequestException('Invalid token ID');
  if (!/^[0-9A-Za-z]{6}$/.test(senderShortId)) throw new BadRequestException('senderShortId must be exactly 6 Base62 characters');
  if (!/^[0-9A-Za-z]{6}$/.test(receiverShortId)) throw new BadRequestException('receiverShortId must be exactly 6 Base62 characters');
  const amount = decodeBase62(amountBase62);
  if (amount <= 0n) throw new BadRequestException('Amount must be greater than zero');
  if (amount > I128_MAX) throw new BadRequestException(`Amount ${amount} exceeds i128::MAX — invalid voucher`);
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(nonce) || Buffer.from(restorePadding(nonce), 'base64').length !== 32) throw new BadRequestException('Nonce must decode to 32 bytes');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(signature) || Buffer.from(restorePadding(signature), 'base64').length !== 64) throw new BadRequestException('Signature must decode to 64 bytes');

  return { tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature };
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transactionManager: StellarTransactionManager,
  ) {}

  async processSettlement(smsBody: string) {
    const payload = parseSettlementSmsBody(smsBody);
    const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
    if (existing && existing.status !== 'PENDING') {
      throw new LegacyBodyException(409, { txHash: existing.txHash, status: existing.status });
    }
    const [sender, receiver, token] = await Promise.all([
      this.prisma.account.findUnique({ where: { shortId: payload.senderShortId } }),
      this.prisma.account.findUnique({ where: { shortId: payload.receiverShortId } }),
      this.prisma.token.findUnique({ where: { id: Number(payload.tokenId) } }),
    ]);
    if (!sender || !receiver) throw new NotFoundException('Account Not Found');
    if (!token) throw new NotFoundException('Token Not Found');
    if (!token.isActive) throw new BadRequestException('Token is inactive');
    const gateway = this.config.get<string>('RELAYER_PUBLIC_KEY')?.trim();
    const secret = this.config.get<string>('RELAYER_SECRET_KEY')?.trim();
    if (!gateway || !secret) throw new LegacyBodyException(500, { error: 'Relayer not configured' });
    if (!sender.offlineDeviceKey) throw new ConflictException('Offline device key is not enrolled. Sign in online to synchronize this device.');
    const amount = decodeBase62(payload.amountBase62);
    const toll = token.symbol === 'PHPC' ? 5_000_000n : 0n;
    const nonce = Buffer.from(restorePadding(payload.nonce), 'base64');
    const signature = Buffer.from(restorePadding(payload.signature), 'base64');
    const contractId = this.config.getOrThrow<string>('CONTRACT_ID');
    const signedBytes = buildOfflineSignatureXdr({ amountStroops: amount, protocolToll: toll, nonce, receiverShortId: payload.receiverShortId, gatewayPublicKey: gateway, tokenContractId: token.contractId, contractId });
    let valid: boolean;
    try { valid = Keypair.fromPublicKey(sender.offlineDeviceKey).verify(signedBytes, signature); } catch { valid = false; }
    if (!valid) {
      const legacyBytes = buildOfflineSignatureXdr({ amountStroops: amount, protocolToll: toll, nonce, receiverShortId: payload.receiverShortId, gatewayPublicKey: gateway, tokenContractId: token.contractId });
      try { valid = Keypair.fromPublicKey(sender.offlineDeviceKey).verify(legacyBytes, signature); } catch { valid = false; }
    }
    if (!valid) throw new UnauthorizedException('Unauthorized');
    let settlement = existing;
    if (!settlement) {
      try {
        settlement = await this.prisma.settlement.create({ data: {
          qstashMessageId: `engine-${payload.nonce}`, nonce: payload.nonce, senderShortId: payload.senderShortId,
          receiverShortId: payload.receiverShortId, tokenId: token.id, amountStroops: amount,
          relayerAddress: gateway, status: 'PENDING',
        } });
      } catch (error) {
        // A parallel worker may have claimed this voucher between the lookup and insert.
        if (isPrismaUniqueConflict(error)) {
          settlement = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
          if (!settlement) throw error;
          if (settlement.status !== 'PENDING') {
            throw new LegacyBodyException(409, { txHash: settlement.txHash, status: settlement.status });
          }
        } else {
          throw error;
        }
      }
    }

    const args = {
      gateway,
      sender: sender.stellarPublicKey,
      token: token.contractId,
      receiver_short_id: Buffer.from(payload.receiverShortId, 'ascii'),
      amount,
      protocol_toll: toll,
      nonce,
      signature,
    };
    const outcome = settlement.txHash && settlement.signedTxXdr
      ? await this.transactionManager.resumeTwoPhaseSettlement({
          settlementId: settlement.id,
          txHash: settlement.txHash,
          signedTxXdr: settlement.signedTxXdr,
        })
      : await this.transactionManager.executeTwoPhaseSettlement({
          settlementId: settlement.id,
          args,
          relayerSecretKey: secret,
        });

    if (outcome.pollResult.status === 'SUCCESS') {
      await this.prisma.settlement.update({
        where: { id: settlement.id },
        data: { status: 'SETTLED', txHash: outcome.txHash, failReason: null },
      });
      return { txHash: outcome.txHash, status: 'SETTLED' };
    }
    if (outcome.pollResult.status === 'FAILED') {
      const reason = outcome.pollResult.errorResultXdr ?? 'Soroban transaction failed';
      await this.prisma.settlement.update({
        where: { id: settlement.id },
        data: { status: 'FAILED', txHash: outcome.txHash, failReason: reason },
      });
      return { txHash: outcome.txHash, status: 'FAILED' };
    }
    throw new Error(`Settlement transaction ${outcome.txHash} is not confirmed yet (timeout)`);
  }
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
