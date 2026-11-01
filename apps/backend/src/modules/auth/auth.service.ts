import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair, StrKey, WebAuth } from '@stellar/stellar-sdk';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
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

getChallenge(account: string | undefined) {
      if (!account) {
  throw new ApiResponseException(400, {
    error: 'Bad Request',
    message: "Missing required query parameter: 'account'",
  });
  }
  if (!StrKey.isValidEd25519PublicKey(account)) {
    throw new ApiResponseException(400, {
      error: 'Bad Request',
      message: `Invalid Stellar account address: ${account}`,
    });
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
    );
    return { transaction, network_passphrase: this.networkPassphrase };
  }

  async issueToken(transaction: unknown) {
    if (!transaction) {
      throw new ApiResponseException(400, {
        error: 'Bad Request',
        message: "Missing required field in body: 'transaction'",
      });
    }
    const tx = transaction as string;
  const server = this.serverKeypair.publicKey();
  const homeDomains = this.homeDomains;
  const primaryDomain = homeDomains[0];

    let clientAccountID: string;
  let memo: string | null | undefined;
  try {
    ({ clientAccountID, memo } = WebAuth.readChallengeTx(
    tx, server, this.networkPassphrase, homeDomains, primaryDomain,
    ));

    let record;
    try {
      record = await this.stellar.horizonServer.loadAccount(clientAccountID);
    } catch (err) {
      this.logger.debug(`Could not load account from Horizon: ${clientAccountID} - ${(err as Error).message}`);
      throw new ApiResponseException(401, {
        error: 'Unauthorized',
        message:
          'Could not load account from the Stellar network. Ensure the account is funded and exists on-chain.',
      });
    }

    const signers = record.signers;
    const totalWeight = signers.reduce((sum, s) => sum + s.weight, 0);
    WebAuth.verifyChallengeTxThreshold(
      tx, server, this.networkPassphrase, totalWeight, signers, homeDomains, primaryDomain,
    );
  } catch (err) {
    if (err instanceof ApiResponseException) throw err;
    this.logger.debug(`SEP-10 verification failed: ${(err as Error).message}`);
    throw new ApiResponseException(401, {
      error: 'Unauthorized',
      message:
        'SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.',
    });
  }

  const token = this.jwtService.sign({
    sub: clientAccountID,
    iss: primaryDomain,
    ...(memo != null ? { memo } : {}),
  });
  return { token };
}
}