import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair, StrKey, WebAuth } from '@stellar/stellar-sdk';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { parseTtl } from './auth-jwt.config.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly stellar: StellarService,
  ) {}

  private get serverKeypair(): Keypair {
    const seed = this.configService.get<string>('SECRET_SEP10_SIGNING_SEED');
    if (!seed) throw new InternalServerErrorException('SECRET_SEP10_SIGNING_SEED is required');
    return Keypair.fromSecret(seed);
  }

     private get homeDomains(): string[] {
     const raw = this.configService.get<string>('SEP10_HOME_DOMAINS');
     if (!raw) throw new InternalServerErrorException('SEP10_HOME_DOMAINS is required');
     return raw.split(',').map((d) => d.trim()).filter(Boolean);
   }

  private get networkPassphrase(): string {
    return this.stellar.networkPassphrase;
  }

  get tokenIssuer(): string {
  return this.homeDomains[0];
}

getChallenge(account: string | undefined, memo?: string) {
      if (!account) {
    throw new BadRequestException("Missing required query parameter: 'account'");
    }
    if (!StrKey.isValidEd25519PublicKey(account)) {
      throw new BadRequestException(`Invalid Stellar account address: ${account}`);
    }
    // Deliberate deviation: legacy passed memo as the 9th argument (clientSigningKey), so it was silently dropped.
    if (memo !== undefined && !/^\d+$/.test(memo)) {
      throw new BadRequestException('Invalid memo');
    }
    const homeDomain = this.homeDomains[0];
    const timeout = parseTtl(
      this.configService.get<string | number>('SEP10_AUTH_TIMEOUT'),
      'SEP10_AUTH_TIMEOUT',
      900,
    );

    const transaction = WebAuth.buildChallengeTx(
      this.serverKeypair,
      account,
      homeDomain,
      timeout,
      this.networkPassphrase,
      homeDomain, // web auth domain
      memo, // 7th argument, not 9th
    );
    return { transaction, network_passphrase: this.networkPassphrase };
  }

  async issueToken(transaction: string) {
  if (!transaction?.trim()) {
    throw new BadRequestException("Missing required field in body: 'transaction'");
  }
  const server = this.serverKeypair.publicKey();
  const homeDomains = this.homeDomains;
  const primaryDomain = homeDomains[0];

  let clientAccountID: string;
  let memo: string | null | undefined;
  try {
    ({ clientAccountID, memo } = WebAuth.readChallengeTx(
      transaction, server, this.networkPassphrase, homeDomains, primaryDomain,
    ));
    const record = await this.stellar.horizonServer.loadAccount(clientAccountID); // unfunded -> throws -> 401
    const signers = record.signers;
    const totalWeight = signers.reduce((sum, s) => sum + s.weight, 0);
    WebAuth.verifyChallengeTxThreshold(
      transaction, server, this.networkPassphrase, totalWeight, signers, homeDomains, primaryDomain,
    );
  } catch (err) {
    this.logger.debug(`SEP-10 verification failed: ${(err as Error).message}`);
    throw new UnauthorizedException(
      'SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.',
    );
  }

  const token = this.jwtService.sign({
    sub: clientAccountID,
    iss: primaryDomain,
    ...(memo != null ? { memo } : {}),
  });
  return { token };
}
}