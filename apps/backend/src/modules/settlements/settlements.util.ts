import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import {
  buildOfflineSignatureXdr as buildVoucherSignatureXdr,
  decodeBase62,
  parseOfflineVoucher,
  restoreBase64Padding,
  verifyOfflineVoucherSignature,
} from './offline-voucher.util.js';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  /** Checks account/token state and signature, then sends the signed offline spend transaction. */
  async processSettlement(smsBody: string) {
    const payload = parseSettlementSmsBody(smsBody);
    const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } });
    if (existing) {
      throw new ApiResponseException(409, { txHash: existing.txHash, status: existing.status });
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
    if (!valid) throw new UnauthorizedException('Unauthorized');
    try {
      const contract = await this.stellar.getContract();
      const assembled = await contract.spend_offline({
        gateway, sender: sender.stellarPublicKey, token: token.contractId,
        receiver_short_id: Buffer.from(payload.receiverShortId, 'ascii'), amount,
        protocol_toll: toll, nonce, signature,
      }, { publicKey: gateway });
      const relayer = Keypair.fromSecret(secret);
      const { sendTransactionResponse } = await assembled.signAndSend({
        signTransaction: async (txXdr: string, options?: { networkPassphrase?: string }) => {
          const tx = TransactionBuilder.fromXDR(txXdr, options?.networkPassphrase ?? this.stellar.networkPassphrase);
          tx.sign(relayer);
          return { signedTxXdr: tx.toXDR(), signerAddress: relayer.publicKey() };
        },
      });
      const txHash = sendTransactionResponse?.hash ?? null;
      await this.prisma.settlement.create({ data: {
        qstashMessageId: `nest-${payload.nonce}`, nonce: payload.nonce, senderShortId: payload.senderShortId,
        receiverShortId: payload.receiverShortId, tokenId: token.id, amountStroops: amount,
        relayerAddress: gateway, txHash, status: 'SETTLED',
      } });
      return { txHash, status: 'SETTLED' };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new BadGatewayException('Failed to submit offline settlement to Stellar network.');
    }
  }
}
