import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Contract,
  Keypair,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { shortIdToBuffer } from '../../common/utils/short-id.util.js';
import {
  authorizedInvocation,
  injectSourceAccountAuth,
  isPublicKey,
  parsePositiveI128,
  rebuildForSourceAccount,
} from './engine.util.js';

const ONLINE_TRANSFER_PROTOCOL = 2;

@Injectable()
export class EngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  async prepareDeposit(body: Record<string, unknown>) {
    const { senderPublicKey, tokenAddress, offlineDevicePubkeyHex, amountStroops } = body;
    if (!senderPublicKey || !tokenAddress || !offlineDevicePubkeyHex || !amountStroops) {
      throw new BadRequestException('Missing required fields: senderPublicKey, tokenAddress, offlineDevicePubkeyHex, amountStroops');
    }
    if (!isPublicKey(senderPublicKey)) throw new BadRequestException('Invalid senderPublicKey format');
    if (typeof offlineDevicePubkeyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(offlineDevicePubkeyHex)) {
      throw new BadRequestException('offlineDevicePubkeyHex must be a 64-char hex string (32 bytes)');
    }
    const amount = parsePositiveI128(amountStroops);
    if (amount === null) throw new BadRequestException('amountStroops must be a positive integer string');
    const token = await this.activeToken(tokenAddress);
    const relayer = this.relayerPublicKey();
    try {
      const contract = await this.stellar.getContract();
      const assembled: any = await contract.deposit(
        { sender: senderPublicKey, token: token.contractId, pubkey: Buffer.from(offlineDevicePubkeyHex, 'hex'), amount },
        { publicKey: relayer },
      );
      this.assertAssembled(assembled);
      const sender = new Address(senderPublicKey).toScVal();
      const contractAddress = new Address(this.contractId()).toScVal();
      const transfer = authorizedInvocation({
        contractId: token.contractId,
        functionName: 'transfer',
        args: [sender, contractAddress, nativeToScVal(amount, { type: 'i128' })],
      });
      const authored = injectSourceAccountAuth(
        assembled.built.toEnvelope().toXDR('base64'),
        this.contractId(),
        [transfer],
      );
      const xdr = rebuildForSourceAccount({
        envelopeXdr: authored,
        sourceAccount: await this.stellar.sorobanServer.getAccount(senderPublicKey),
        networkPassphrase: this.stellar.networkPassphrase,
        sorobanData: assembled.simulation?.transactionData,
      });
      return { xdr, txHash: await this.recordMove(xdr, senderPublicKey, 'TO_OFFLINE', token.id, amount) };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(`Failed to prepare deposit transaction: ${errorMessage(error)}`);
    }
  }

  async prepareWithdraw(body: Record<string, unknown>) {
    const { senderPublicKey, tokenAddress, amountStroops } = body;
    if (!senderPublicKey || !tokenAddress || !amountStroops) {
      throw new BadRequestException('Missing required fields: senderPublicKey, tokenAddress, amountStroops');
    }
    if (!isPublicKey(senderPublicKey)) throw new BadRequestException('Invalid senderPublicKey format');
    const amount = parsePositiveI128(amountStroops);
    if (amount === null) throw new BadRequestException('amountStroops must be a positive integer string');
    const token = await this.activeToken(tokenAddress);
    const relayer = this.relayerPublicKey();
    try {
      const contract = await this.stellar.getContract();
      const assembled: any = await contract.withdraw(
        { sender: senderPublicKey, token: token.contractId, amount },
        { publicKey: relayer },
      );
      this.assertAssembled(assembled);
      const authored = injectSourceAccountAuth(
        assembled.built.toEnvelope().toXDR('base64'),
        this.contractId(),
      );
      const xdr = rebuildForSourceAccount({
        envelopeXdr: authored,
        sourceAccount: await this.stellar.sorobanServer.getAccount(senderPublicKey),
        networkPassphrase: this.stellar.networkPassphrase,
        sorobanData: assembled.simulation?.transactionData,
      });
      return { xdr, txHash: await this.recordMove(xdr, senderPublicKey, 'TO_ONLINE', token.id, amount) };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(`Soroban simulation failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Notes a move between the user's own wallets as PENDING under the hash of the transaction just prepared (signing
   * does not change a transaction's hash), so History can list it once the app confirms it landed. A failure here
   * must not block the move itself, so it is swallowed: the money still moves, it just is not listed.
   */
  private async recordMove(
    xdr: string,
    accountPublicKey: string,
    direction: 'TO_OFFLINE' | 'TO_ONLINE',
    tokenId: number,
    amountStroops: bigint,
  ): Promise<string> {
    const txHash = TransactionBuilder.fromXDR(xdr, this.stellar.networkPassphrase).hash().toString('hex');
    try {
      await this.prisma.walletMove.upsert({
        where: { txHash },
        update: {},
        create: { txHash, accountPublicKey, direction, tokenId, amountStroops },
      });
    } catch (error) {
      console.error(`[engine] could not record wallet move ${txHash}: ${errorMessage(error)}`);
    }
    return txHash;
  }

  async prepareTransfer(body: Record<string, unknown>) {
    const { senderPublicKey, recipientPublicKey, tokenAddress, amountStroops } = body;
    if (!senderPublicKey || !recipientPublicKey || !tokenAddress || !amountStroops) {
      throw new BadRequestException('Missing required fields: senderPublicKey, recipientPublicKey, tokenAddress, amountStroops');
    }
    if (body.paymentMode !== 'online' || body.clientProtocol !== ONLINE_TRANSFER_PROTOCOL) {
      throw new ApiResponseException(426, {
        error: 'Client upgrade required: explicit online transfer intent is missing.',
        code: 'ONLINE_TRANSFER_PROTOCOL_REQUIRED',
      });
    }
    if (!isPublicKey(senderPublicKey) || !isPublicKey(recipientPublicKey)) {
      throw new BadRequestException('Invalid public key format');
    }
    const amount = parsePositiveI128(amountStroops);
    if (amount === null) throw new BadRequestException('amountStroops must be a positive integer string');
    const token = await this.activeToken(tokenAddress);
    const relayer = this.relayerPublicKey();
    try {
      const relayerAccount = await this.stellar.sorobanServer.getAccount(relayer);
      const operation = new Contract(token.contractId).call(
        'transfer',
        new Address(senderPublicKey).toScVal(),
        new Address(recipientPublicKey).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
      );
      const baseTx = new TransactionBuilder(relayerAccount, {
        fee: '100000',
        networkPassphrase: this.stellar.networkPassphrase,
      }).addOperation(operation).setTimeout(300).build();
      const simulation: any = await this.stellar.sorobanServer.simulateTransaction(baseTx);
      if (simulation.error) throw new Error(`Soroban simulation failed: ${simulation.error}`);
      if (!simulation.transactionData) throw new Error('Soroban simulation produced no transaction data');

      const authored = injectSourceAccountAuth(
        baseTx.toEnvelope().toXDR('base64'),
        token.contractId,
        [],
      );
      const minimumFee = simulation.minResourceFee
        ? (BigInt(simulation.minResourceFee) + 1000n).toString()
        : '100000';
      const xdrEnvelope = rebuildForSourceAccount({
        envelopeXdr: authored,
        sourceAccount: await this.stellar.sorobanServer.getAccount(senderPublicKey),
        networkPassphrase: this.stellar.networkPassphrase,
        fee: minimumFee,
        sorobanData: simulation.transactionData,
      });
      const txHash = TransactionBuilder.fromXDR(xdrEnvelope, this.stellar.networkPassphrase).hash().toString('hex');
      await this.prisma.onlineTransfer.upsert({
        where: { txHash },
        update: {},
        create: { txHash, senderPublicKey, recipientPublicKey, tokenId: token.id, amountStroops: amount },
      });
      return { xdr: xdrEnvelope, txHash };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ApiResponseException) throw error;
      throw new InternalServerErrorException(`Failed to prepare transfer transaction: ${errorMessage(error)}`);
    }
  }

  async prepareOfflineKey(accountPublicKey: string, body: Record<string, unknown>) {
    const publicKey = typeof body.offlineDeviceKey === 'string' ? body.offlineDeviceKey.trim() : '';
    if (!StrKey.isValidEd25519PublicKey(publicKey)) throw new BadRequestException('offlineDeviceKey must be a valid Ed25519 G-address');
    const account = await this.prisma.account.findUnique({ where: { stellarPublicKey: accountPublicKey }, select: { id: true } });
    if (!account) throw new NotFoundException('Authenticated account is not registered');
    const rawKey = Buffer.from(StrKey.decodeEd25519PublicKey(publicKey));
    const contract = await this.stellar.getContract();
    const relayer = this.relayerPublicKey();
    const onChain = await contract.get_offline_key({ sender: accountPublicKey }, { publicKey: relayer });
    if (onChain.result && Buffer.from(onChain.result).equals(rawKey)) {
      await this.prisma.account.update({ where: { stellarPublicKey: accountPublicKey }, data: { offlineDeviceKey: publicKey } });
      return { status: 'synced' };
    }
    const assembled: any = await contract.set_offline_key(
      { sender: accountPublicKey, pubkey: rawKey },
      { publicKey: relayer },
    );
    this.assertAssembled(assembled);
    const authored = injectSourceAccountAuth(assembled.built.toEnvelope().toXDR('base64'), this.contractId());
    return {
      status: 'rotation_required',
      xdr: rebuildForSourceAccount({
        envelopeXdr: authored,
        sourceAccount: await this.stellar.sorobanServer.getAccount(accountPublicKey),
        networkPassphrase: this.stellar.networkPassphrase,
        sorobanData: assembled.simulation?.transactionData,
      }),
    };
  }

  async confirmOfflineKey(accountPublicKey: string, body: Record<string, unknown>) {
    const publicKey = typeof body.offlineDeviceKey === 'string' ? body.offlineDeviceKey.trim() : '';
    if (!StrKey.isValidEd25519PublicKey(publicKey)) throw new BadRequestException('offlineDeviceKey must be a valid Ed25519 G-address');
    const rawKey = Buffer.from(StrKey.decodeEd25519PublicKey(publicKey));
    const contract = await this.stellar.getContract();
    const onChain = await contract.get_offline_key({ sender: accountPublicKey }, { publicKey: this.relayerPublicKey() });
    if (!onChain.result || !Buffer.from(onChain.result).equals(rawKey)) {
      throw new ApiResponseException(409, { error: 'The submitted device key is not confirmed on-chain' });
    }
    await this.prisma.account.update({ where: { stellarPublicKey: accountPublicKey }, data: { offlineDeviceKey: publicKey } });
    return { status: 'synced' };
  }

  async registerRecipient(accountPublicKey: string) {
    const account = await this.prisma.account.findUnique({
      where: { stellarPublicKey: accountPublicKey },
      select: { shortId: true, stellarPublicKey: true },
    });
    if (!account) throw new NotFoundException('Authenticated account is not registered');
    const registrar = this.registrarKeypair();
    const shortId = shortIdToBuffer(account.shortId);
    const contract = await this.stellar.getContract();
    const configured = await contract.get_registrar({ publicKey: registrar.publicKey() });
    if (!configured.result) throw new InternalServerErrorException('Contract registrar is not configured; run set_registrar after upgrading');
    if (configured.result !== registrar.publicKey()) throw new InternalServerErrorException('Backend registrar does not match the registrar configured on-chain');
    const existing = await contract.get_recipient({ short_id: shortId }, { publicKey: registrar.publicKey() });
    if (existing.result && existing.result !== account.stellarPublicKey) {
      throw new ApiResponseException(409, { error: 'Short ID is already registered to a different Stellar address' });
    }
    let status = 'already_registered';
    let txHash: string | undefined;
    if (!existing.result) {
      const registration = await contract.register_recipient(
        { registrar: registrar.publicKey(), short_id: shortId, receiver: account.stellarPublicKey },
        { publicKey: registrar.publicKey() },
      );
      const result = await registration.signAndSend({
        signTransaction: async (transactionXdr: string, signOptions?: { networkPassphrase?: string }) => {
          const transaction = TransactionBuilder.fromXDR(transactionXdr, signOptions?.networkPassphrase ?? this.stellar.networkPassphrase);
          transaction.sign(registrar);
          return { signedTxXdr: transaction.toXDR(), signerAddress: registrar.publicKey() };
        },
      });
      txHash = result.sendTransactionResponse?.hash;
      status = 'registered';
    }
    return { status, txHash, offlineConfig: await this.getOfflineConfig() };
  }

  async getOfflineConfig() {
    const gatewayPublicKey = this.relayerPublicKey();
    const symbol = this.config.get<string>('OFFLINE_TOKEN_SYMBOL')?.trim() || 'PHPC';
    const token = await this.prisma.token.findUnique({ where: { symbol }, select: { id: true, symbol: true, contractId: true } });
    if (!token) throw new InternalServerErrorException('Offline payment token is not configured');
    return {
      version: 1,
      contractId: this.contractId(),
      gatewayPublicKey,
      tokenContractId: token.contractId,
      tokenDbId: String(token.id),
      tokenSymbol: token.symbol,
      networkPassphrase: this.stellar.networkPassphrase,
    };
  }

  private async activeToken(contractId: unknown) {
    if (typeof contractId !== 'string') throw new BadRequestException('Invalid token contract');
    const token = await this.prisma.token.findUnique({ where: { contractId }, select: { id: true, contractId: true, symbol: true, isActive: true } });
    if (!token?.isActive) throw new BadRequestException('Unsupported or inactive token contract');
    return token;
  }

  private relayerPublicKey(): string {
    const key = this.config.get<string>('RELAYER_PUBLIC_KEY')?.trim();
    if (!key) throw new InternalServerErrorException('Server misconfiguration: RELAYER_PUBLIC_KEY not set');
    return key;
  }

  private registrarKeypair(): Keypair {
    const secret = this.config.get<string>('REGISTRAR_SECRET_KEY')?.trim() || this.config.get<string>('RELAYER_SECRET_KEY')?.trim();
    if (!secret) throw new InternalServerErrorException('Server is missing REGISTRAR_SECRET_KEY');
    const keypair = Keypair.fromSecret(secret);
    const configured = this.config.get<string>('REGISTRAR_PUBLIC_KEY')?.trim();
    if (configured && configured !== keypair.publicKey()) throw new InternalServerErrorException('REGISTRAR_PUBLIC_KEY does not match REGISTRAR_SECRET_KEY');
    return keypair;
  }

  private contractId(): string {
    return this.config.getOrThrow<string>('CONTRACT_ID');
  }

  private assertAssembled(assembled: any): void {
    if (!assembled?.built) throw new Error('Soroban assembly produced no transaction');
    const simulationError = assembled.simulation?.error;
    if (simulationError) throw new Error(`Soroban simulation failed: ${simulationError}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
