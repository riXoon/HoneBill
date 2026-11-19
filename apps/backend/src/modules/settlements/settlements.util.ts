import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import {
  buildOfflineSignatureXdr as buildVoucherSignatureXdr,
  decodeBase62,
  parseOfflineVoucher,
  restoreBase64Padding,
  verifyOfflineVoucherSignature,
} from './offline-voucher.util.js';
import { StellarTransactionManager } from '../engine/stellar-transaction-manager.service.js';
import { userFailureReason, type VoucherNotice } from '../engine/settlement-notice.util.js';

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
  ) {}

  /** Checks account/token state and signature, then sends the signed offline spend transaction. */
  async processSettlement(smsBody: string) {
    const payload = parseSettlementSmsBody(smsBody);
    const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
    if (existing && existing.status !== 'PENDING') {
      throw new ApiResponseException(409, decidedBody(existing));
    }
    const [sender, receiver, token] = await Promise.all([
      this.prisma.account.findUnique({ where: { shortId: payload.senderShortId } }),
      this.prisma.account.findUnique({ where: { shortId: payload.receiverShortId } }),
      this.prisma.token.findUnique({ where: { id: Number(payload.tokenId) } }),
    ]);
    if (!sender) throw new NotFoundException('Sender account not found');
    if (!token) throw new NotFoundException('Token Not Found');
    const gateway = this.config.get<string>('RELAYER_PUBLIC_KEY')?.trim();
    const secret = this.config.get<string>('RELAYER_SECRET_KEY')?.trim();
    if (!gateway || !secret) throw new ApiResponseException(500, { error: 'Relayer not configured' });
    if (!sender.offlineDeviceKey) throw new ConflictException('Offline device key is not enrolled. Sign in online to synchronize this device.');
    const amount = decodeBase62(payload.amountBase62);
    const toll = token.symbol === 'PHPC' ? 5_000_000n : 0n;
    const nonce = Buffer.from(restorePadding(payload.nonce), 'base64');
    const signature = Buffer.from(restorePadding(payload.signature), 'base64');
    const contractId = this.config.getOrThrow<string>('CONTRACT_ID');
    const signedBytes = buildOfflineSignatureXdr({ amountStroops: amount, protocolToll: toll, nonce, receiverShortId: payload.receiverShortId, gatewayPublicKey: gateway, tokenContractId: token.contractId, contractId });
    let valid: boolean;
    try { valid = verifyOfflineVoucherSignature(sender.offlineDeviceKey, signedBytes, signature); } catch { valid = false; }
    if (!valid) {
      const legacyBytes = buildOfflineSignatureXdr({ amountStroops: amount, protocolToll: toll, nonce, receiverShortId: payload.receiverShortId, gatewayPublicKey: gateway, tokenContractId: token.contractId });
      try { valid = verifyOfflineVoucherSignature(sender.offlineDeviceKey, legacyBytes, signature); } catch { valid = false; }
    }
    if (!valid) {
      // Everything logged is public. Compare with the phone's dev-build "[voucher] signed" log to see which field differs.
      this.logger.warn(
        `Offline voucher signature rejected: ${JSON.stringify({
          senderShortId: payload.senderShortId,
          receiverShortId: payload.receiverShortId,
          amountStroops: amount.toString(),
          tollStroops: toll.toString(),
          nonceHex: nonce.toString('hex'),
          gatewayPublicKey: gateway,
          tokenContractId: token.contractId,
          tokenSymbol: token.symbol,
          contractId,
          enrolledDeviceKey: sender.offlineDeviceKey,
          signedXdrHex: signedBytes.toString('hex'),
          signatureHex: signature.toString('hex'),
        })}`,
      );
      throw new UnauthorizedException('Invalid voucher signature');
    }

    // The sender signed this voucher, so from here a rejection is recorded: it shows in their history with the reason,
    // and the nonce can never settle later (the sender was told no money was taken). Before the signature check nothing
    // is recorded, so a forged text cannot put entries in someone's history.
    if (!receiver) {
      await this.recordRejection(existing, payload, token.id, amount, gateway, 'Recipient account not found');
      throw new NotFoundException('Recipient account not found');
    }
    if (!token.isActive) {
      await this.recordRejection(existing, payload, token.id, amount, gateway, 'Token is inactive');
      throw new BadRequestException('Token is inactive');
    }

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
      return { txHash: outcome.txHash, status: 'FAILED', reason: userFailureReason(reason) };
    }
    throw new Error(`Settlement transaction ${outcome.txHash} is not confirmed yet (timeout)`);
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

  /** Marks a signed voucher that can never settle as FAILED, keeping the reason. A parallel claim of the nonce wins. */
  private async recordRejection(
    existing: { id: number } | null,
    payload: ReturnType<typeof parseSettlementSmsBody>,
    tokenId: number,
    amount: bigint,
    gateway: string,
    reason: string,
  ): Promise<void> {
    try {
      if (existing) {
        await this.prisma.settlement.update({ where: { id: existing.id }, data: { status: 'FAILED', failReason: reason } });
        return;
      }
      await this.prisma.settlement.create({ data: {
        qstashMessageId: `engine-${payload.nonce}`, nonce: payload.nonce, senderShortId: payload.senderShortId,
        receiverShortId: payload.receiverShortId, tokenId, amountStroops: amount,
        relayerAddress: gateway, status: 'FAILED', failReason: reason,
      } });
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) {
        this.logger.warn(`Could not record rejected voucher ${payload.nonce}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}