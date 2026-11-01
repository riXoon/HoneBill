import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';

@Injectable()
/** Builds the anchor's SEP documents and reads account-owned SEP-24 transactions. */
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);
  private readonly interactiveTokenTtlSeconds = 15 * 60;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Derives the public SEP-10 key and advertises URLs, network, and supported assets in TOML. */
  stellarToml(): { status: number; headers: Record<string, string>; body: string } {
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    };
    try {
      const seed = this.config.get<string>('SECRET_SEP10_SIGNING_SEED');
      const origin = this.config.get<string>('NEXT_PUBLIC_APP_URL');
      if (!seed) throw new Error('[stellar.toml] Missing required environment variable: SECRET_SEP10_SIGNING_SEED');
      if (!origin) throw new Error('[stellar.toml] Missing required environment variable: NEXT_PUBLIC_APP_URL');
      const signingKey = Keypair.fromSecret(seed).publicKey();
      if (!StrKey.isValidEd25519PublicKey(signingKey)) {
        throw new Error('Derived SIGNING_KEY is not a valid Ed25519 public key. Check SECRET_SEP10_SIGNING_SEED.');
      }
      const appUrl = origin.replace(/\/$/, '');
      const toml = `# Pijin Anchor — Stellar Info File (SEP-1)
# Generated dynamically. Do not edit manually.
# See: https://stellar.org/protocol/sep-1

NETWORK_PASSPHRASE="${this.config.get<string>('STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015')}"
WEB_AUTH_ENDPOINT="${appUrl}/api/auth"
SIGNING_KEY="${signingKey}"
TRANSFER_SERVER_SEP0024="${appUrl}/api/sep24"

[[CURRENCIES]]
code="PHPC"
issuer="${this.config.get<string>('PHPC_ISSUER_PUBKEY', '')}"
status="testnet"
is_asset_anchored=true
anchor_asset_type="fiat"

[[CURRENCIES]]
code="USDC"
issuer="${this.config.get<string>('USDC_ISSUER_PUBKEY', '')}"
status="testnet"
is_asset_anchored=true
anchor_asset_type="fiat"

HORIZON_URL="${this.config.get<string>('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org')}"
`;
      return {
        status: 200,
        headers: { ...headers, 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600' },
        body: toml,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to generate stellar.toml: ${message}`);
      return { status: 500, headers, body: `# Error generating stellar.toml\n# ${message}\n` };
    }
  }

  /** Reflects ramp kill switches and configured per-transaction limits in the public info response. */
  sep24Info() {
    const active = this.config.get<string>('RAMP_ENABLED') !== 'false';
    const deposit = active && this.config.get<string>('DEPOSIT_ENABLED') !== 'false';
    const withdraw = active && this.config.get<string>('WITHDRAW_ENABLED') !== 'false';
    return {
      deposit: {
        PHPC: { enabled: deposit, max_amount: Number(this.config.get<string>('RAMP_MAX_PER_TX_PHPC', '5000')) },
        USDC: { enabled: deposit, max_amount: Number(this.config.get<string>('RAMP_MAX_PER_TX_USDC', '100')) },
      },
      withdraw: {
        PHPC: { enabled: withdraw, max_amount: Number(this.config.get<string>('RAMP_MAX_PER_TX_PHPC', '5000')) },
        USDC: { enabled: withdraw, max_amount: Number(this.config.get<string>('RAMP_MAX_PER_TX_USDC', '100')) },
      },
      fee: { enabled: false },
    };
  }

  /** Persists an incomplete ramp transaction after SEP-10 auth and signs its webview handoff URL. */
  async initiateDeposit(authorization: string | undefined, body: unknown) {
    if (this.config.get<string>('RAMP_ENABLED') === 'false' || this.config.get<string>('DEPOSIT_ENABLED') === 'false') {
      throw new ApiResponseException(503, {
        code: 'RAMP_LOCKED',
        error: 'Deposits are temporarily disabled for maintenance.',
      });
    }

    const account = await this.requireSep10Account(authorization, 'deposit');
    const request = asRecord(body);
    const assetValue = request?.asset_code;
    let assetCode: string | undefined;
    try {
      assetCode = assetValue == null ? undefined : (assetValue as string).toUpperCase();
    } catch {
      assetCode = undefined;
    }
    if (!assetCode) {
      throw new ApiResponseException(400, {
        error: 'Bad Request',
        message: "Missing required field: 'asset_code'",
      });
    }
    if (!['PHPC', 'USDC'].includes(assetCode)) {
      throw new ApiResponseException(400, {
        error: 'Bad Request',
        message: `Unsupported asset: '${assetCode}'. Supported: PHPC, USDC`,
      });
    }

    try {
      const transaction = await this.prisma.anchorTransaction.create({
        data: {
          stellarAccount: account,
          type: 'deposit',
          status: 'incomplete',
          assetCode,
          memo: typeof request?.memo === 'string' ? request.memo : null,
          memoType: typeof request?.memo_type === 'string' ? request.memo_type : null,
        },
      });
      const token = await this.signInteractiveUrlToken(account, transaction.id, false, '[SEP-24 Deposit]');
      const appUrl = this.requireSetting('NEXT_PUBLIC_APP_URL', false, '[SEP-24 Deposit]').replace(/\/$/, '');
      const url = `${appUrl}/deposit?transaction_id=${encodeURIComponent(transaction.id)}&token=${encodeURIComponent(token)}`;
      return { type: 'interactive_customer_info_needed', url, id: transaction.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`SEP-24 deposit initiation failed: ${message}`);
      throw new ApiResponseException(500, { error: 'Internal Server Error', message });
    }
  }

  /** Persists an incomplete withdrawal and returns its short-lived interactive webview URL. */
  async initiateWithdrawal(authorization: string | undefined, body: unknown) {
    if (this.config.get<string>('RAMP_ENABLED') === 'false' || this.config.get<string>('WITHDRAW_ENABLED') === 'false') {
      throw new ApiResponseException(503, {
        code: 'RAMP_LOCKED',
        error: 'Withdrawals are temporarily disabled for maintenance.',
      });
    }

    const account = await this.requireSep10Account(authorization, 'withdrawal');
    const request = asRecord(body);
    const assetCode = typeof request?.asset_code === 'string'
      ? request.asset_code.trim().toUpperCase()
      : '';
    if (!['PHPC', 'USDC'].includes(assetCode)) {
      throw new ApiResponseException(400, {
        error: 'invalid_request',
        message: 'asset_code must be PHPC or USDC.',
      });
    }

    try {
      const transaction = await this.prisma.anchorTransaction.create({
        data: {
          stellarAccount: account,
          type: 'withdrawal',
          status: 'incomplete',
          assetCode,
        },
      });
      const token = await this.signInteractiveUrlToken(account, transaction.id, true);
      const appUrl = this.requireSetting('NEXT_PUBLIC_APP_URL', true).replace(/\/$/, '');
      const url = new URL('/withdraw', `${appUrl}/`);
      url.searchParams.set('transaction_id', transaction.id);
      url.searchParams.set('token', token);
      return {
        type: 'interactive_customer_info_needed',
        url: url.toString(),
        id: transaction.id,
      };
    } catch (error) {
      this.logger.error(`SEP-24 withdrawal initiation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiResponseException(500, {
        error: 'server_error',
        message: 'Unable to initiate the withdrawal.',
      });
    }
  }

  private async requireSep10Account(
    authorization: string | undefined,
    action: 'deposit' | 'withdrawal',
  ): Promise<string> {
    let secret: string;
    try {
      secret = this.requireSetting(
        'SECRET_SEP10_JWT_SECRET',
        action === 'withdrawal',
        action === 'deposit' ? '[SEP-24 Deposit]' : '[SEP-24 Withdrawal]',
      );
    } catch (error) {
      if (action === 'deposit') {
        throw new ApiResponseException(500, {
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw new ApiResponseException(401, {
        error: 'unauthorized',
        message: 'A valid SEP-10 bearer token is required.',
      });
    }
    try {
      if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token');
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(authorization.slice(7).trim(), {
        secret,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new Error('SEP-10 token is missing a valid sub claim');
      }
      return payload.sub;
    } catch {
      throw new ApiResponseException(401, action === 'deposit'
        ? { error: 'Unauthorized', message: 'A valid SEP-10 bearer token is required.' }
        : { error: 'unauthorized', message: 'A valid SEP-10 bearer token is required.' });
    }
  }

  private async signInteractiveUrlToken(
    account: string,
    transactionId: string,
    trim: boolean,
    errorPrefix = '[SEP-24 Withdrawal]',
  ): Promise<string> {
    const secret = this.requireSetting(
      'SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET',
      trim,
      errorPrefix,
    );
    return this.jwt.signAsync(
      { sub: account, transaction_id: transactionId },
      { secret, algorithm: 'HS256', expiresIn: this.interactiveTokenTtlSeconds },
    );
  }

  private requireSetting(
    name: string,
    trim: boolean,
    errorPrefix = '[SEP-24]',
  ): string {
    const raw = this.config.get<string>(name);
    const value = trim ? raw?.trim() : raw;
    if (!value) {
      const missingLabel = errorPrefix === '[SEP-24 Deposit]' ? 'env var' : 'environment variable';
      throw new Error(`${errorPrefix} Missing ${missingLabel}: ${name}`);
    }
    return value;
  }

  /** Verifies the webview session and atomically starts the user's withdrawal transfer. */
  async submitWithdrawal(authorization: string | undefined, body: unknown, forwardedIp?: string) {
    this.enforceRamp('withdraw');
    let session: { sub: string; transaction_id: string };
    try {
      session = await this.verifyInteractiveToken(authorization);
    } catch {
      throw new ApiResponseException(401, { success: false, error: 'This withdrawal session is invalid or has expired.' });
    }
    const request = asRecord(body);
    if (!request) throw new ApiResponseException(400, { success: false, error: 'The request body must be valid JSON.' });
    const transactionId = typeof request.transaction_id === 'string' ? request.transaction_id.trim() : '';
    const amount = typeof request.amount === 'string' || typeof request.amount === 'number' ? String(request.amount).trim() : '';
    const gcashNumber = typeof request.gcash_number === 'string' ? request.gcash_number.replace(/[\s-]/g, '') : '';
    if (!transactionId || session.transaction_id !== transactionId) {
      throw new ApiResponseException(403, { success: false, error: 'The transaction does not match this signed session.' });
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(amount) || Number(amount) <= 0) {
      throw new ApiResponseException(400, { success: false, error: 'amount must be positive and have at most 7 decimal places.' });
    }
    if (!/^(?:09\d{9}|\+639\d{9})$/.test(gcashNumber)) {
      throw new ApiResponseException(400, { success: false, error: 'gcash_number must be a valid 09XXXXXXXXX or +639XXXXXXXXX number.' });
    }
    const existing = await this.prisma.anchorTransaction.findUnique({
      where: { id: transactionId }, select: { assetCode: true, stellarAccount: true },
    });
    if (!existing || existing.stellarAccount !== session.sub) {
      throw new ApiResponseException(404, { success: false, error: 'Withdrawal transaction not found or account mismatch.' });
    }
    const limit = await this.validateRampLimits(existing.stellarAccount, existing.assetCode, Number(amount));
    if (!limit.allowed) {
      this.auditRamp({ action: 'withdraw', transactionId, user: existing.stellarAccount, amount, asset: existing.assetCode, ip: forwardedIp, status: 'REJECTED', reason: limit.error });
      throw new ApiResponseException(400, { success: false, error: limit.error ?? 'Withdrawal limit exceeded.' });
    }
    const memo = transactionId.replace(/-/g, '').substring(0, 28);
    try {
      const updated = await this.prisma.anchorTransaction.updateMany({
        where: { id: transactionId, stellarAccount: session.sub, type: 'withdrawal', status: 'incomplete' },
        data: { status: 'pending_user_transfer_start', amountIn: amount, amountOut: amount, memo, memoType: 'text' },
      });
      if (updated.count !== 1) {
        throw new ApiResponseException(409, { success: false, error: 'Withdrawal not found or it has already been submitted.' });
      }
      this.auditRamp({ action: 'withdraw', transactionId, user: session.sub, amount, asset: existing.assetCode, ip: forwardedIp, status: 'INITIATED' });
      // GCash data is validated but not persisted or logged until an encrypted payout-details model exists.
      return { success: true };
    } catch (error) {
      if (error instanceof ApiResponseException) throw error;
      this.logger.error(`Submit withdrawal failed for ${transactionId}: ${errorMessage(error)}`);
      throw new ApiResponseException(500, { success: false, error: 'Unable to submit the withdrawal.' });
    }
  }

  /** Checks a SEP-10-owned withdrawal payment on Testnet Horizon before advancing its state. */
  async confirmWithdrawal(authorization: string | undefined, body: unknown, forwardedIp?: string) {
    this.enforceRamp('withdraw');
    let account: string;
    try { account = await this.requireSep10Account(authorization, 'withdrawal'); }
    catch { throw new ApiResponseException(401, { success: false, error: 'A valid SEP-10 token is required.' }); }
    const request = asRecord(body);
    if (!request) throw new ApiResponseException(400, { success: false, error: 'The request body must be valid JSON.' });
    const transactionId = typeof request.transaction_id === 'string' ? request.transaction_id.trim() : '';
    const hash = typeof request.stellar_transaction_id === 'string' ? request.stellar_transaction_id.trim().toLowerCase() : '';
    if (!transactionId || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new ApiResponseException(400, { success: false, error: 'Valid transaction IDs are required.' });
    }
    try {
      const tx = await this.prisma.anchorTransaction.findFirst({ where: { id: transactionId, stellarAccount: account, type: 'withdrawal' } });
      if (!tx) throw new ApiResponseException(404, { success: false, error: 'Withdrawal not found.' });
      if (tx.status === 'pending_external') return { success: true, status: 'pending_external' };
      if (tx.status !== 'pending_user_transfer_start' || !tx.amountIn || !tx.memo) {
        throw new ApiResponseException(409, { success: false, error: 'Withdrawal is not awaiting a user transfer.' });
      }
      const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
      const [stellarTx, operationsPage] = await Promise.all([
        horizon.transactions().transaction(hash).call(),
        horizon.operations().forTransaction(hash).limit(200).call(),
      ]);
      const treasury = this.requireSetting('TREASURY_PUBLIC_KEY', true, '[Confirm Withdrawal]');
      const issuer = this.assetIssuer(tx.assetCode);
      const transactionMatches = stellarTx.successful === true && stellarTx.source_account === account && stellarTx.memo_type === 'text' && stellarTx.memo === tx.memo;
      const paymentMatches = operationsPage.records.some((operation: any) =>
        operation.type === 'payment' && operation.from === account && operation.to === treasury &&
        operation.asset_type !== 'native' && operation.asset_code === tx.assetCode && operation.asset_issuer === issuer &&
        typeof operation.amount === 'string' && amountToStroops(operation.amount) === amountToStroops(tx.amountIn!),
      );
      if (!transactionMatches || !paymentMatches) {
        this.auditRamp({ action: 'withdraw', transactionId, user: account, amount: tx.amountIn, asset: tx.assetCode, ip: forwardedIp, status: 'FAILED', hash, reason: 'Horizon verification mismatch' });
        throw new ApiResponseException(422, { success: false, error: 'The Stellar payment does not match this withdrawal.' });
      }
      const updated = await this.prisma.anchorTransaction.updateMany({
        where: { id: transactionId, stellarAccount: account, status: 'pending_user_transfer_start' },
        data: { status: 'pending_external' },
      });
      if (updated.count !== 1) throw new ApiResponseException(409, { success: false, error: 'Withdrawal status changed during confirmation.' });
      this.auditRamp({ action: 'withdraw', transactionId, user: account, amount: tx.amountIn, asset: tx.assetCode, ip: forwardedIp, status: 'COMPLETED', hash });
      return { success: true, status: 'pending_external' };
    } catch (error) {
      if (error instanceof ApiResponseException) throw error;
      this.logger.error(`Confirm withdrawal failed for ${transactionId}: ${errorMessage(error)}`);
      throw new ApiResponseException(500, { success: false, error: 'Unable to verify the Stellar withdrawal payment.' });
    }
  }

  /** Settles a deposit by signing with a distributor account, pinned to Stellar Testnet. */
  async simulatePayment(authorization: string | undefined, body: unknown, forwardedIp?: string) {
    if (this.config.get<string>('STELLAR_NETWORK_PASSPHRASE', Networks.TESTNET) !== Networks.TESTNET) {
      throw new ApiResponseException(503, { success: false, error: 'This endpoint is only available on Stellar Testnet.' });
    }
    this.enforceRamp('deposit');
    const request = asRecord(body);
    if (!request) throw new ApiResponseException(400, { success: false, error: 'Invalid JSON body.' });
    const transactionId = typeof request.transaction_id === 'string' ? request.transaction_id : '';
    if (!transactionId) throw new ApiResponseException(400, { success: false, error: 'Missing required field: transaction_id' });
    if (request.amount === undefined || request.amount === null || request.amount === '') {
      throw new ApiResponseException(400, { success: false, error: 'Missing required field: amount' });
    }
    const amount = Number.parseFloat(String(request.amount)).toFixed(7);
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new ApiResponseException(400, { success: false, error: 'Amount must be a positive number.' });
    const mock = transactionId.startsWith('mock-');
    let token = typeof request.token === 'string' ? request.token : '';
    if (!token && authorization?.startsWith('Bearer ')) token = authorization.slice(7).trim();
    let session: { sub: string; transaction_id: string } | undefined;
    if (!token && !mock) throw new ApiResponseException(401, { success: false, error: 'Unauthorized: missing SEP-24 interactive token.' });
    if (token) {
      try { session = await this.verifyInteractiveToken(`Bearer ${token}`); }
      catch (error) {
        if (!mock) throw new ApiResponseException(401, { success: false, error: 'Interactive session expired or invalid.', detail: errorMessage(error) });
      }
    }
    if (session && session.transaction_id !== transactionId && !mock) throw new ApiResponseException(403, { success: false, error: 'Interactive token does not match requested transaction.' });
    let tx: any;
    try {
      tx = await this.prisma.anchorTransaction.findUnique({ where: { id: transactionId } });
    } catch (error) {
      this.logger.error(`DB read error for tx=${transactionId}: ${errorMessage(error)}`);
      if (!mock) {
        throw new ApiResponseException(500, { success: false, error: 'Database error while fetching transaction.', detail: errorMessage(error) });
      }
    }
    if (!tx && mock && typeof request.stellarAccount === 'string') {
      const assetCode = typeof request.asset_code === 'string' ? request.asset_code.toUpperCase() : 'PHPC';
      try {
        tx = await this.prisma.anchorTransaction.upsert({
          where: { id: transactionId },
          create: { id: transactionId, stellarAccount: request.stellarAccount, assetCode, type: 'deposit', status: 'incomplete' },
          update: { stellarAccount: request.stellarAccount, assetCode, status: 'incomplete' },
        });
      } catch {
        // Keep the legacy mock-only script usable without a reachable database.
        tx = { id: transactionId, stellarAccount: request.stellarAccount, assetCode, type: 'deposit', status: 'incomplete', amountIn: null, amountOut: null, amountFee: null, memo: null, memoType: null, createdAt: new Date(), updatedAt: new Date() };
      }
    }
    if (!tx) throw new ApiResponseException(404, { success: false, error: `Transaction not found: ${transactionId}` });
    if (session && tx.stellarAccount !== session.sub && !mock) throw new ApiResponseException(403, { success: false, error: 'Interactive token does not belong to the transaction recipient.' });
    if (tx.status === 'completed' || tx.status === 'pending_external') throw new ApiResponseException(409, { success: false, error: 'This transaction has already been settled or is processing.' });
    const limit = await this.validateRampLimits(tx.stellarAccount, tx.assetCode, numericAmount);
    if (!limit.allowed) {
      this.auditRamp({ action: 'deposit', transactionId, user: tx.stellarAccount, amount, asset: tx.assetCode, ip: forwardedIp, status: 'REJECTED', reason: limit.error });
      throw new ApiResponseException(400, { success: false, error: limit.error ?? 'Transaction limit exceeded.' });
    }
    if (!mock) {
      try {
        const claimed = await this.redis.getClient().set(`pijin:sep24:token:used:${transactionId}`, 'used', 'EX', 3600, 'NX');
        if (claimed !== 'OK') throw new ApiResponseException(409, { success: false, error: 'Interactive deposit session has already been submitted.' });
      } catch (error) {
        if (error instanceof ApiResponseException) throw error;
        // Match the legacy ramp helper: a Redis outage logs and fails open rather than stranding the user.
        this.logger.error(`Redis error claiming SEP-24 token for ${transactionId}: ${errorMessage(error)}`);
      }
    }
    const statusClaim = await this.prisma.anchorTransaction.updateMany({ where: { id: transactionId, status: 'incomplete' }, data: { status: 'pending_external', amountIn: amount } });
    if (statusClaim.count !== 1) throw new ApiResponseException(409, { success: false, error: 'Transaction status conflict; could not claim deposit.' });
    this.auditRamp({ action: 'deposit', transactionId, user: tx.stellarAccount, amount, asset: tx.assetCode, ip: forwardedIp, status: 'INITIATED' });
    let distributor: Keypair;
    try {
      const distributorSecret = this.requireSetting(tx.assetCode === 'PHPC' ? 'PHPC_DISTRIBUTOR_SECRET' : 'USDC_DISTRIBUTOR_SECRET', false, '[SimulatePayment]');
      distributor = Keypair.fromSecret(distributorSecret);
    } catch (error) {
      throw new ApiResponseException(500, { success: false, error: 'Unsupported asset or missing distributor secret.', detail: errorMessage(error) });
    }
    let asset: Asset;
    try {
      asset = new Asset(tx.assetCode.toUpperCase(), this.assetIssuer(tx.assetCode));
    } catch (error) {
      throw new ApiResponseException(500, { success: false, error: 'Unsupported asset or missing issuer public key.', detail: errorMessage(error) });
    }
    let stellarTxHash: string;
    try {
      const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
      const distributorAccount = await horizon.loadAccount(distributor.publicKey());
      const payment = new TransactionBuilder(distributorAccount, { fee: '500', networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.payment({ destination: tx.stellarAccount, asset, amount }))
        .addMemo(Memo.text(`SEP24-DEP:${tx.id.slice(0, 16)}`))
        .setTimeout(180).build();
      payment.sign(distributor);
      const submitted = await horizon.submitTransaction(payment);
      stellarTxHash = submitted.hash;
    } catch (error) {
      const detail = horizonFailureDetail(error);
      await this.prisma.anchorTransaction.update({ where: { id: transactionId }, data: { status: 'error' } }).catch(() => undefined);
      this.auditRamp({ action: 'deposit', transactionId, user: tx.stellarAccount, amount, asset: tx.assetCode, ip: forwardedIp, status: 'FAILED', reason: detail });
      throw new ApiResponseException(422, { success: false, error: 'Stellar transaction failed. The Testnet may be slow or the asset trustline may be missing.', detail });
    }
    try {
      await this.prisma.anchorTransaction.update({ where: { id: transactionId }, data: { status: 'completed', amountIn: amount, amountOut: amount } });
      this.auditRamp({ action: 'deposit', transactionId, user: tx.stellarAccount, amount, asset: tx.assetCode, ip: forwardedIp, status: 'COMPLETED', hash: stellarTxHash });
    } catch (error) {
      // A successful on-chain payment remains a successful API response even if persistence needs reconciliation.
      this.logger.error(`CRITICAL: Stellar tx succeeded (${stellarTxHash}) but DB update failed for tx=${transactionId}: ${errorMessage(error)}`);
    }
    return { success: true, stellar_tx_hash: stellarTxHash, amount, asset_code: tx.assetCode, destination: tx.stellarAccount };
  }

  private async verifyInteractiveToken(authorization: string | undefined): Promise<{ sub: string; transaction_id: string }> {
    const secret = this.requireSetting('SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET', true);
    if (!authorization?.startsWith('Bearer ')) throw new Error('Missing bearer token');
    const payload = await this.jwt.verifyAsync<{ sub?: unknown; transaction_id?: unknown }>(authorization.slice(7).trim(), { secret, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.transaction_id !== 'string') throw new Error('Interactive token is missing required claims');
    return { sub: payload.sub, transaction_id: payload.transaction_id };
  }

  private enforceRamp(action: 'deposit' | 'withdraw'): void {
    if (this.config.get<string>('RAMP_ENABLED') === 'false') {
      throw new ApiResponseException(503, { code: 'RAMP_LOCKED', error: 'On/Off Ramp is temporarily disabled for maintenance.' });
    }
    if (this.config.get<string>(action === 'deposit' ? 'DEPOSIT_ENABLED' : 'WITHDRAW_ENABLED') === 'false') {
      const label = action === 'deposit' ? 'Deposits' : 'Withdrawals';
      throw new ApiResponseException(503, { code: 'RAMP_LOCKED', error: `${label} are temporarily disabled for maintenance.` });
    }
  }

  private assetIssuer(asset: string): string {
    if (asset === 'PHPC') return this.requireSetting('PHPC_ISSUER_PUBKEY', true);
    if (asset === 'USDC') return this.requireSetting('USDC_ISSUER_PUBKEY', true);
    throw new Error(`Unsupported asset code: ${asset}`);
  }

  private async validateRampLimits(account: string, assetCode: string, amount: number): Promise<{ allowed: boolean; error?: string }> {
    const code = assetCode.toUpperCase();
    const caps = code === 'USDC'
      ? { perTx: this.config.get<number>('RAMP_MAX_PER_TX_USDC', 100), daily: this.config.get<number>('RAMP_DAILY_MAX_PER_USER_USDC', 400) }
      : { perTx: this.config.get<number>('RAMP_MAX_PER_TX_PHPC', 5000), daily: this.config.get<number>('RAMP_DAILY_MAX_PER_USER_PHPC', 20000) };
    if (amount <= 0) return { allowed: false, error: 'Amount must be greater than zero.' };
    if (amount > caps.perTx) return { allowed: false, error: `Transaction amount exceeds the maximum limit of ${caps.perTx} ${code} per transaction.` };
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    try {
      const rows = await this.prisma.anchorTransaction.findMany({ where: { stellarAccount: account, assetCode: code, status: { in: ['completed', 'pending_external'] }, createdAt: { gte: start } }, select: { amountIn: true, amountOut: true } });
      const daily = rows.reduce((sum, row) => { const value = Number.parseFloat(row.amountIn || row.amountOut || '0'); return sum + (Number.isFinite(value) ? value : 0); }, 0);
      if (daily + amount > caps.daily) return { allowed: false, error: `Daily limit of ${caps.daily} ${code} exceeded for this account (current today: ${daily.toFixed(2)} ${code}).` };
    } catch (error) { this.logger.error(`Unable to check daily ramp limit: ${errorMessage(error)}`); }
    return { allowed: true };
  }

  private auditRamp(event: { action: 'deposit' | 'withdraw'; transactionId: string; user: string; amount: string | number; asset: string; ip?: string; status: 'INITIATED' | 'COMPLETED' | 'REJECTED' | 'FAILED'; hash?: string; reason?: string }): void {
    this.logger.log(`[Audit][Ramp] action=${event.action} status=${event.status} txId=${event.transactionId} user=${event.user} amount=${event.amount} asset=${event.asset} ip=${event.ip ?? '127.0.0.1'} hash=${event.hash ?? 'none'}${event.reason ? ` reason="${event.reason}"` : ''}`);
  }

  /** Verifies SEP-10 identity, hides missing/foreign IDs behind the same 404, and maps the owned record. */
  async sep24Transaction(authorization: string | undefined, id: string | undefined) {
    const secret = this.config.get<string>('SECRET_SEP10_JWT_SECRET');
    if (!secret) throw new InternalServerErrorException('[SEP-24 Transaction] Missing env var: SECRET_SEP10_JWT_SECRET');
    let account: string;
    try {
      if (!authorization?.startsWith('Bearer ')) throw new Error('Missing or malformed Authorization header. Expected: Bearer <token>');
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(authorization.slice(7).trim(), {
        secret,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string') throw new Error('JWT payload is missing the required `sub` claim.');
      account = payload.sub;
    } catch {
      throw new ApiResponseException(401, { error: 'Unauthorized', message: 'A valid SEP-10 bearer token is required.' });
    }
    if (!id) {
      throw new ApiResponseException(400, { error: 'Bad Request', message: "Missing required query parameter: 'id'" });
    }
    const tx = await this.prisma.anchorTransaction.findUnique({ where: { id } });
    if (!tx || tx.stellarAccount !== account) {
      throw new ApiResponseException(404, { error: 'Not Found', message: 'Transaction not found.' });
    }
    const transaction: Record<string, unknown> = {
      id: tx.id,
      kind: tx.type,
      status: tx.status,
      amount_in: tx.amountIn,
      amount_out: tx.amountOut,
      amount_fee: tx.amountFee,
      stellar_account: tx.stellarAccount,
      asset_code: tx.assetCode,
      started_at: tx.createdAt.toISOString(),
      updated_at: tx.updatedAt.toISOString(),
      memo: tx.memo,
      memo_type: tx.memoType,
    };
    if (tx.type === 'withdrawal') {
      const treasury = this.config.get<string>('TREASURY_PUBLIC_KEY')?.trim();
      if (!treasury) throw new InternalServerErrorException('[SEP-24 Transaction] Missing env var: TREASURY_PUBLIC_KEY');
      transaction.withdraw_anchor_account = treasury;
      if (tx.memo) {
        transaction.withdraw_memo = tx.memo;
        transaction.withdraw_memo_type = tx.memoType;
      }
    }
    return { transaction };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function amountToStroops(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value);
  if (!match) throw new Error(`Invalid Stellar amount: ${value}`);
  return BigInt(match[1]) * 10_000_000n + BigInt((match[2] ?? '').padEnd(7, '0'));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function horizonFailureDetail(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response;
    const resultCodes = response?.data?.extras?.result_codes;
    if (resultCodes) return JSON.stringify(resultCodes);
  }
  return errorMessage(error);
}
