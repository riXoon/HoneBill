import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair, Networks, Transaction, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import type { StellarService } from '../../infra/stellar/stellar.service';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { AuthService } from './auth.service';

const JWT_SECRET = 'test-jwt-secret-only';
const DOMAIN = 'localhost:3000';
const TTL_SECONDS = 86400;

function createService(
  seed = Keypair.random().secret(),
  config: Record<string, unknown> = {},
) {
  const loadAccount = jest.fn<(id: string) => Promise<unknown>>();
  const stellar = {
    horizonServer: { loadAccount },
    networkPassphrase: Networks.TESTNET,
  } as unknown as StellarService;

  const configService = new ConfigService({
    SECRET_SEP10_SIGNING_SEED: seed,
    SEP10_HOME_DOMAINS: DOMAIN,
    SEP10_AUTH_TIMEOUT: 900,
    ...config,
  });
  const jwtService = new JwtService({
    secret: JWT_SECRET,
    signOptions: { expiresIn: TTL_SECONDS, algorithm: 'HS256' },
  });

  return { service: new AuthService(configService, jwtService, stellar), seed, jwtService, loadAccount };
}

function signChallenge(xdr: string, signer: Keypair, passphrase = Networks.TESTNET): string {
  const transaction = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  transaction.sign(signer);
  return transaction.toXDR();
}

function fundedAccount(...keys: Keypair[]) {
  return {
    signers: keys.map((k) => ({ key: k.publicKey(), weight: 1, type: 'ed25519_public_key' })),
  };
}

describe('AuthService SEP-10', () => {
  const client = Keypair.random();

  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('getChallenge', () => {
    it('returns a challenge and the network passphrase', () => {
      const { service } = createService();
      const result = service.getChallenge(client.publicKey());
      expect(result.transaction).toEqual(expect.any(String));
      expect(result.network_passphrase).toBe(Networks.TESTNET);
    });

    it('uses StellarService passphrase when the config passphrase differs', () => {
      const { service } = createService(undefined, {
        STELLAR_NETWORK_PASSPHRASE: Networks.PUBLIC,
      });

      const result = service.getChallenge(client.publicKey());

      expect(result.network_passphrase).toBe(Networks.TESTNET);
      expect(() => TransactionBuilder.fromXDR(result.transaction, Networks.TESTNET)).not.toThrow();
    });

    it('rejects an invalid SEP10_AUTH_TIMEOUT instead of passing NaN to Stellar', () => {
      const { service } = createService(undefined, { SEP10_AUTH_TIMEOUT: 'abc' });

      expect(() => service.getChallenge(client.publicKey())).toThrow(
        'SEP10_AUTH_TIMEOUT must be a positive integer (seconds)',
      );
    });

    it('rejects a missing account with the legacy message', () => {
      const { service } = createService();
      expect(() => service.getChallenge(undefined)).toThrow(
        "Missing required query parameter: 'account'",
      );
    });

    it('rejects an invalid account, echoing it like legacy', () => {
      const { service } = createService();
      expect(() => service.getChallenge('GABC')).toThrow('Invalid Stellar account address: GABC');
    });

    it('builds a challenge without a memo', () => {
      const { service } = createService();
      expect(service.getChallenge(client.publicKey()).transaction).toEqual(expect.any(String));
    });

    it('fails when SEP10_HOME_DOMAINS is missing (no localhost default)', () => {
      const { service } = createService(undefined, { SEP10_HOME_DOMAINS: undefined });
      expect(() => service.getChallenge(client.publicKey())).toThrow(InternalServerErrorException);
    });
  });

  describe('issueToken', () => {
    it('issues a token for a valid signed challenge', async () => {
      const { service, jwtService, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());

      const { token } = await service.issueToken(signChallenge(transaction, client));
      const claims = jwtService.verify(token);

      expect(claims.sub).toBe(client.publicKey());
      expect(claims.iss).toBe(DOMAIN);
      expect(claims.exp).toBeGreaterThan(claims.iat);
      expect(claims).not.toHaveProperty('memo');
    });

    it('does not include a memo claim when the challenge has no memo', async () => {
      const { service, jwtService, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());

      const { token } = await service.issueToken(signChallenge(transaction, client));
      expect(jwtService.verify(token)).not.toHaveProperty('memo');
    });

    it('preserves a memo claim from a valid signed challenge that contains a memo', async () => {
      const { service, seed, jwtService, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const transaction = WebAuth.buildChallengeTx(
        Keypair.fromSecret(seed),
        client.publicKey(),
        DOMAIN,
        900,
        Networks.TESTNET,
        DOMAIN,
        '12345',
      );

      const { token } = await service.issueToken(signChallenge(transaction, client));
      expect(jwtService.verify(token).memo).toBe('12345');
    });

    it('rejects an empty transaction with 400', async () => {
      const { service } = createService();
      await expect(service.issueToken('')).rejects.toMatchObject({
        status: 400,
        responseBody: {
          error: 'Bad Request',
          message: "Missing required field in body: 'transaction'",
        },
      });
    });

    it('passes whitespace-only transaction values to SDK verification', async () => {
      const { service } = createService();
      await expect(service.issueToken('   ')).rejects.toMatchObject({
        status: 401,
        responseBody: {
          error: 'Unauthorized',
          message:
            'SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.',
        },
      });
    });

    it.each([123, {}])('lets truthy non-string transaction values reach SDK verification', async (value) => {
      const { service } = createService();
      await expect(service.issueToken(value)).rejects.toMatchObject({
        status: 401,
        responseBody: {
          error: 'Unauthorized',
          message:
            'SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.',
        },
      });
    });

    it('rejects a malformed transaction with 401', async () => {
      const { service } = createService();
      await expect(service.issueToken('not-a-transaction')).rejects.toMatchObject({
        status: 401,
        responseBody: {
          error: 'Unauthorized',
          message:
            'SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.',
        },
      });
    });

    it('rejects an unsigned challenge', async () => {
      const { service, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());
      await expect(service.issueToken(transaction)).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects a challenge signed by a different account', async () => {
      const { service, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());
      await expect(
        service.issueToken(signChallenge(transaction, Keypair.random())),
      ).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects a challenge signed for a different network', async () => {
      const { service, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());
      await expect(
        service.issueToken(signChallenge(transaction, client, Networks.PUBLIC)),
      ).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects an expired challenge', async () => {
      const { service, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = service.getChallenge(client.publicKey());
      const signed = signChallenge(transaction, client);
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1300 * 1000);
      await expect(service.issueToken(signed)).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects a challenge issued by another server key', async () => {
      const { service: issuer } = createService();
      const { service: verifier, loadAccount } = createService();
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = issuer.getChallenge(client.publicKey());
      await expect(
        verifier.issueToken(signChallenge(transaction, client)),
      ).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects an unexpected home domain', async () => {
      const seed = Keypair.random().secret();
      const { service: issuer } = createService(seed, { SEP10_HOME_DOMAINS: 'evil.example' });
      const { service: verifier, loadAccount } = createService(seed);
      loadAccount.mockResolvedValue(fundedAccount(client));
      const { transaction } = issuer.getChallenge(client.publicKey());
      await expect(
        verifier.issueToken(signChallenge(transaction, client)),
      ).rejects.toBeInstanceOf(ApiResponseException);
    });

    it('rejects an unfunded account with the legacy error body and detail message', async () => {
      const { service, loadAccount } = createService();
      loadAccount.mockRejectedValue(new Error('Not Found'));
      const { transaction } = service.getChallenge(client.publicKey());
      await expect(
        service.issueToken(signChallenge(transaction, client)),
      ).rejects.toMatchObject({
        status: 401,
        responseBody: {
          error: 'Unauthorized',
          message:
            'Could not load account from the Stellar network. Ensure the account is funded and exists on-chain.',
        },
      });
    });

    it('requires every on-chain signer to sign (legacy all-weights threshold)', async () => {
      const { service, loadAccount } = createService();
      const cosigner = Keypair.random();
      loadAccount.mockResolvedValue(fundedAccount(client, cosigner));
      const { transaction } = service.getChallenge(client.publicKey());
      await expect(
        service.issueToken(signChallenge(transaction, client)),
      ).rejects.toBeInstanceOf(ApiResponseException);
    });
      it('tokenIssuer returns the first home domain', () => {
     const { service } = createService(undefined, { SEP10_HOME_DOMAINS: 'a.example, b.example' });
     expect(service.tokenIssuer).toBe('a.example');
   });
   it('tokenIssuer throws when SEP10_HOME_DOMAINS is missing', () => {
     const { service } = createService(undefined, { SEP10_HOME_DOMAINS: undefined });
     expect(() => service.tokenIssuer).toThrow(InternalServerErrorException);
   });
  });
});