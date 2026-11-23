import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LEGACY_PHPC_OFFLINE_FEE_STROOPS, offlineFeeStroops } from 'pijin_core/offline-fee';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { isPlausiblePhone, normalizePhoneNumber } from '../../common/utils/phone.util.js';
import {
  buildOfflineSignatureXdr as buildVoucherSignatureXdr,
  decodeBase62,
  parseOfflineVoucher,
  restoreBase64Padding,
  verifyOfflineVoucherSignature,
} from './offline-voucher.util.js';
import { StellarTransactionManager } from '../engine/stellar-transaction-manager.service.js';
import { userFailureReason, type VoucherNotice } from '../engine/settlement-notice.util.js';
import { SettlementFinalizationService } from './settlement-finalization.service.js';

/**
 * A voucher decided before: its status, plus for a failed one the reason in the sender's words, so a later text
 * about it (the same voucher texted again, or the gateway after the app) says why instead of only "did not go through".
 */
function decidedBody(settlement: { txHash: string | null; status: string; failReason?: string | null }) {
  return {
    txHash: settlement.txHash,
    status: settlement.status,
    ...(settlement.status === 'FAILED' ? { reason: userFailureReason(settlement.failReason) } : {}),
  };
}

// Preserve the settlement helper exports while sharing parsing and XDR logic with Phase 5.
/** Retains the existing settlement import while using the shared Base62 decoder. */
export { decodeBase62 };
/** Retains the old helper name for settlement callers while sharing padding logic. */
export const restorePadding = restoreBase64Padding;

/** Adapts settlement terminology to the shared contract-compatible XDR serializer. */
export function buildOfflineSignatureXdr(input: {
  amountStroops: bigint; protocolToll: bigint; nonce: Buffer; receiverShortId: string;
  gatewayPublicKey: string; tokenContractId: string; contractId?: string;
}): Buffer {
  return buildVoucherSignatureXdr({
    amountStroops: input.amountStroops,
    tollStroops: input.protocolToll,
    nonce: input.nonce,
    receiverShortId: input.receiverShortId,
    gatewayPublicKey: input.gatewayPublicKey,
    tokenContractId: input.tokenContractId,
    contractAddress: input.contractId,
  });
}

/** Adapts the shared voucher parser to settlement's existing string fields and HTTP errors. */
export function parseSettlementSmsBody(smsBody: string): {
  tokenId: string;
  senderShortId: string;
  receiverShortId: string;
  amountBase62: string;
  nonce: string;
  signature: string;
} {
  try {
    const parsed = parseOfflineVoucher(smsBody ?? '');
    return {
      tokenId: parsed.tokenIdStr,
      senderShortId: parsed.senderShortId,
      receiverShortId: parsed.receiverShortId,
      amountBase62: parsed.amountBase62,
      nonce: parsed.nonceB64,
      signature: parsed.signatureB64,
    };
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'Malformed SMS payload');
  }
}

@Injectable()
/** Validates an offline voucher, submits it to Soroban, and records the resulting settlement. */
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transactionManager: StellarTransactionManager,
    private readonly finalization: SettlementFinalizationService,
  ) {}

  /** Checks account/token state and signature, then sends the signed offline spend transaction. */
  async processSettlement(smsBody: string, relayPhone?: string) {
    const payload = parseSettlementSmsBody(smsBody);
    const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
    if (existing && existing.status !== 'PENDING') {
      throw new ApiResponseException(409, decidedBody(existing));
    }
    const submitted = !!(existing?.txHash || existing?.signedTxXdr);
    if (submitted && existing?.recoveryReview) throw settlementPending();
    const [sender, receiver, token] = await Promise.all([
      this.prisma.account.findUnique({ where: { shortId: payload.senderShortId } }),
      this.prisma.account.findUnique({ where: { shortId: payload.receiverShortId } }),
      this.prisma.token.findUnique({ where: { id: Number(payload.tokenId) } }),
    ]);
    if (!sender || !token) {
      if (submitted) throw settlementPending();
      throw new NotFoundException(!sender ? 'Sender account not found' : 'Token Not Found');
    }
    const gateway = this.config.get<string>('RELAYER_PUBLIC_KEY')?.trim();
    const secret = this.config.get<string>('RELAYER_SECRET_KEY')?.trim();
    if (!gateway || !secret) throw new ApiResponseException(500, { error: 'Relayer not configured' });
    if (!sender.offlineDeviceKey) {
      if (submitted) throw settlementPending();
      throw new ConflictException('Offline device key is not enrolled. Sign in online to synchronize this device.');
    }
    const amount = decodeBase62(payload.amountBase62);
    const tieredToll = offlineFeeStroops(amount, token.symbol);
    const legacyToll = token.symbol === 'PHPC' ? LEGACY_PHPC_OFFLINE_FEE_STROOPS : 0n;
    const nonce = Buffer.from(restorePadding(payload.nonce), 'base64');
    const signature = Buffer.from(restorePadding(payload.signature), 'base64');
    const contractId = this.config.getOrThrow<string>('CONTRACT_ID');
    const signatureFields = {
      amountStroops: amount, nonce, receiverShortId: payload.receiverShortId,
      gatewayPublicKey: gateway, tokenContractId: token.contractId,
    };
    const deviceKey = sender.offlineDeviceKey;
    const verifies = (protocolToll: bigint, signedContract?: string): boolean => {
      const bytes = buildOfflineSignatureXdr({ ...signatureFields, protocolToll, contractId: signedContract });
      return verifyOfflineVoucherSignature(deviceKey, bytes, signature);
    };
    let toll: bigint | undefined;
    try {
      if (verifies(tieredToll, contractId)) toll = tieredToll;
      else if ((legacyToll !== tieredToll && verifies(legacyToll, contractId)) || verifies(legacyToll)) toll = legacyToll;
    } catch {
      // Invalid key material or signature input is handled as a rejected voucher below.
    }
    if (toll === undefined) {
      if (submitted) throw settlementPending();
      this.logger.warn(`Offline voucher signature rejected for token ${token.id}`);
      throw new UnauthorizedException('Invalid voucher signature');
    }
    if (existing?.protocolToll != null && existing.protocolToll !== toll) throw settlementPending();

    // The sender signed this voucher, so from here a rejection is recorded: it shows in their history with the reason,
    // and the nonce can never settle later (the sender was told no money was taken). Before the signature check nothing
    // is recorded, so a forged text cannot put entries in someone's history.
    if (!receiver) {
      if (submitted) throw settlementPending();
      await this.recordRejection(existing, payload, token.id, amount, toll, gateway, 'Recipient account not found');
      throw new NotFoundException('Recipient account not found');
    }
    if (!token.isActive) {
      if (submitted) throw settlementPending();
      await this.recordRejection(existing, payload, token.id, amount, toll, gateway, 'Token is inactive');
      throw new BadRequestException('Token is inactive');
    }

    let settlement = existing;
    if (!settlement) {
      try {
        settlement = await this.prisma.settlement.create({ data: {
          qstashMessageId: `engine-${payload.nonce}`, nonce: payload.nonce, senderShortId: payload.senderShortId,
          receiverShortId: payload.receiverShortId, tokenId: token.id, amountStroops: amount,
          protocolToll: toll, relayerAddress: gateway, status: 'PENDING',
        } });
      } catch (error) {
        // A parallel worker may have claimed this voucher between the lookup and insert.
        if (isPrismaUniqueConflict(error)) {
          settlement = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
          if (!settlement) throw error;
          if (settlement.status !== 'PENDING') {
            throw new ApiResponseException(409, decidedBody(settlement));
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
    const lease = await this.finalization.claim(settlement.id);
    if (!lease) {
      const current = await this.prisma.settlement.findUnique({ where: { id: settlement.id } });
      if (current && current.status !== 'PENDING') throw new ApiResponseException(409, decidedBody(current));
      throw settlementPending();
    }
    try {
      const current = await this.prisma.settlement.findUnique({
        where: { id: lease.id, recoveryLease: lease.token, recoveryLeaseUntil: { gt: new Date() } },
        select: { txHash: true, signedTxXdr: true, recoveryReview: true, protocolToll: true },
      });
      if (!current || (current.recoveryReview && (current.txHash || current.signedTxXdr))) throw settlementPending();
      if (current.protocolToll != null && current.protocolToll !== toll) throw settlementPending();
      if (current.protocolToll === null && !current.txHash && !current.signedTxXdr) {
        const saved = await this.prisma.settlement.updateMany({
          where: { id: lease.id, recoveryLease: lease.token, recoveryLeaseUntil: { gt: new Date() },
            protocolToll: null, txHash: null, signedTxXdr: null },
          data: { protocolToll: toll },
        });
        if (!saved.count) throw settlementPending();
      }
      if (typeof relayPhone === 'string' && isPlausiblePhone(relayPhone)) {
        await this.prisma.settlement.updateMany({
          where: { id: settlement.id, recoveryLease: lease.token, relayReceiptPhone: null },
          data: { relayReceiptPhone: normalizePhoneNumber(relayPhone) },
        });
      }
      if (current.txHash && current.signedTxXdr) {
        const prior = await this.finalization.check(lease, true, Date.now() + 5_000);
        if (prior.finalized && prior.evidence.status === 'SETTLED') {
          return { txHash: prior.evidence.txHash, status: 'SETTLED' };
        }
        if (prior.evidence.status !== 'PENDING' || prior.evidence.attempts.some((attempt) =>
          attempt.txHash === current.txHash && attempt.status !== 'UNKNOWN')) throw settlementPending();
      }
      try {
        if (current.txHash && current.signedTxXdr) {
          await this.transactionManager.resumeTwoPhaseSettlement({
            settlementId: settlement.id, txHash: current.txHash, signedTxXdr: current.signedTxXdr, leaseToken: lease.token,
          });
        } else {
          await this.transactionManager.executeTwoPhaseSettlement({
            settlementId: settlement.id, args, receiverAddress: receiver.stellarPublicKey, relayerSecretKey: secret, leaseToken: lease.token,
          });
        }
      } catch (error) {
        if (error instanceof ApiResponseException && error.getStatus() === 409) throw error;
        // The send may have reached Stellar before the request failed. Check evidence even after a submit error.
        const current = await this.prisma.settlement.findUnique({ where: { id: settlement.id }, select: { txHash: true } });
        if (!current?.txHash) throw settlementPending();
      }
      const result = await this.finalization.check(lease, true, Date.now() + 5_000);
      if (result.finalized && result.evidence.status === 'SETTLED') {
        return { txHash: result.evidence.txHash, status: 'SETTLED' };
      }
      throw settlementPending();
    } catch (error) {
      if (error instanceof ApiResponseException) throw error;
      throw settlementPending();
    } finally {
      await this.finalization.release(lease).catch(() => this.logger.warn('Settlement claim will expire after a release error.'));
    }
  }

  /**
   * What the settlement texts need about a voucher: amount, both short IDs, the token, and the receiver's number.
   * `null` when the body cannot be read; a lookup that fails falls back to PHPC with no receiver number.
   */
  async describeVoucher(smsBody: string): Promise<VoucherNotice | null> {
    let payload: ReturnType<typeof parseSettlementSmsBody>;
    try {
      payload = parseSettlementSmsBody(smsBody);
    } catch {
      return null;
    }
    const [token, receiver, sender] = await Promise.all([
      this.prisma.token.findUnique({ where: { id: Number(payload.tokenId) } }).catch(() => null),
      this.prisma.account.findUnique({ where: { shortId: payload.receiverShortId } }).catch(() => null),
      this.prisma.account.findUnique({ where: { shortId: payload.senderShortId } }).catch(() => null),
    ]);
    return {
      nonce: payload.nonce,
      senderShortId: payload.senderShortId,
      receiverShortId: payload.receiverShortId,
      amountStroops: decodeBase62(payload.amountBase62),
      symbol: token?.symbol ?? 'PHPC',
      decimals: typeof token?.decimals === 'number' ? token.decimals : 7,
      receiverPhone: receiver?.phoneNumber ?? null,
      senderName: sender?.firstName ?? null,
    };
  }

  async claimReceipt(key: string): Promise<boolean> {
    const result = await this.prisma.settlementReceiptClaim.createMany({ data: { key }, skipDuplicates: true });
    return result.count === 1;
  }

  async recoveredReceipt(id: number): Promise<{ relayPhone: string; notice: VoucherNotice } | null> {
    const row = await this.prisma.settlement.findUnique({
      where: { id, status: 'SETTLED' },
      select: {
        nonce: true, txHash: true, senderShortId: true, receiverShortId: true, relayReceiptPhone: true,
        amountStroops: true, token: { select: { symbol: true, decimals: true } },
      },
    });
    if (!row?.relayReceiptPhone || !row.txHash) return null;
    const attempt = await this.prisma.settlementAttempt.findUnique({
      where: { settlementId_txHash: { settlementId: id, txHash: row.txHash } },
      select: { senderAddress: true, receiverAddress: true },
    });
    if (!attempt?.senderAddress || !attempt.receiverAddress) return null;
    const [sender, receiver] = await Promise.all([
      this.prisma.account.findUnique({ where: { stellarPublicKey: attempt.senderAddress }, select: { firstName: true } }),
      this.prisma.account.findUnique({ where: { stellarPublicKey: attempt.receiverAddress }, select: { phoneNumber: true } }),
    ]);
    return { relayPhone: row.relayReceiptPhone, notice: {
      nonce: row.nonce, senderShortId: row.senderShortId, receiverShortId: row.receiverShortId,
      amountStroops: row.amountStroops, symbol: row.token.symbol, decimals: row.token.decimals,
      senderName: sender?.firstName ?? null, receiverPhone: receiver?.phoneNumber ?? null,
    } };
  }

  async clearReceiptRelay(nonce: string): Promise<void> {
    await this.prisma.settlement.updateMany({ where: { nonce, status: 'SETTLED' }, data: { relayReceiptPhone: null } });
  }

  /** Marks a signed voucher that can never settle as FAILED, keeping the reason. A parallel claim of the nonce wins. */
  private async recordRejection(
    existing: { id: number } | null,
    payload: ReturnType<typeof parseSettlementSmsBody>,
    tokenId: number,
    amount: bigint,
    toll: bigint,
    gateway: string,
    reason: string,
  ): Promise<void> {
    try {
      if (existing) {
        const now = new Date();
        const changed = await this.prisma.settlement.updateMany({
          where: { id: existing.id, status: 'PENDING', txHash: null, signedTxXdr: null,
            OR: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { lte: now } }],
            AND: [{ OR: [{ protocolToll: null }, { protocolToll: toll }] }],
          },
          data: { status: 'FAILED', failReason: reason, protocolToll: toll },
        });
        if (!changed.count) throw settlementPending();
        return;
      }
      await this.prisma.settlement.create({ data: {
        qstashMessageId: `engine-${payload.nonce}`, nonce: payload.nonce, senderShortId: payload.senderShortId,
        receiverShortId: payload.receiverShortId, tokenId, amountStroops: amount,
        protocolToll: toll, relayerAddress: gateway, status: 'FAILED', failReason: reason,
      } });
    } catch (error) {
      if (error instanceof ApiResponseException) throw error;
      throw settlementPending();
    }
  }
}

function settlementPending() {
  return new ApiResponseException(503, { error: 'Settlement service unavailable while payment evidence is pending.', status: 'PENDING' });
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
