import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BASE_FEE, Keypair, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';

const MAX_ATTEMPTS = 5;
const DEFAULT_STARTING_BALANCE_XLM = '5';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404;
}

function isBadSequence(error: unknown): boolean {
  return /tx_bad_seq/i.test(JSON.stringify((error as { response?: { data?: unknown } })?.response?.data ?? ''));
}

/**
 * Creates a registered wallet on the ledger with a small XLM balance. Horizon only knows an account once it
 * holds XLM, and SEP-10 sign-in and the PHPC trustline both need it to exist. The XLM is never shown in the app
 * (balances read the PHPC trustline only). Only keys that belong to a registered account are funded, so the
 * route cannot be used to drain the funder with arbitrary addresses.
 */
@Injectable()
export class WalletFundingService {
  private readonly logger = new Logger(WalletFundingService.name);
  /** Funding transactions share one source account, so they take turns: parallel ones would collide on the sequence number. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  async fund(publicKey: string): Promise<{ status: 'created' | 'exists' }> {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) throw new BadRequestException('Invalid Stellar public key.');
    const account = await this.prisma.account.findUnique({ where: { stellarPublicKey: publicKey }, select: { id: true } });
    if (!account) throw new NotFoundException('No registered account has this public key.');

    if (await this.existsOnLedger(publicKey)) return { status: 'exists' };

    const run = this.queue.then(() => this.create(publicKey));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async existsOnLedger(publicKey: string): Promise<boolean> {
    try {
      await this.stellar.horizonServer.loadAccount(publicKey);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw new ServiceUnavailableException('Could not reach the Stellar network.');
    }
  }

  private funder(): Keypair {
    const secret =
      this.config.get<string>('PHPC_DISTRIBUTOR_SECRET')?.trim() || this.config.get<string>('USDC_DISTRIBUTOR_SECRET')?.trim();
    if (!secret) throw new InternalServerErrorException('Server is missing the wallet funding key.');
    try {
      return Keypair.fromSecret(secret);
    } catch {
      throw new InternalServerErrorException('Wallet funding key is invalid.');
    }
  }

  private async create(publicKey: string): Promise<{ status: 'created' | 'exists' }> {
    const funder = this.funder();
    const startingBalance = String(this.config.get<string | number>('WALLET_FUNDING_XLM') ?? DEFAULT_STARTING_BALANCE_XLM);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const source = await this.stellar.horizonServer.loadAccount(funder.publicKey());
        const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.stellar.networkPassphrase })
          .addOperation(Operation.createAccount({ destination: publicKey, startingBalance }))
          .setTimeout(30)
          .build();
        tx.sign(funder);
        await this.stellar.horizonServer.submitTransaction(tx);
        return { status: 'created' };
      } catch (error) {
        // A concurrent request or an earlier attempt may have created it already.
        if (await this.existsOnLedger(publicKey)) return { status: 'exists' };
        if (isBadSequence(error) && attempt < MAX_ATTEMPTS) {
          await sleep(200 * attempt + Math.floor(Math.random() * 200));
          continue;
        }
        this.logger.error(`Funding ${publicKey} failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException('Could not fund the wallet. Try again shortly.');
      }
    }
    throw new ServiceUnavailableException('Could not fund the wallet. Try again shortly.');
  }
}
