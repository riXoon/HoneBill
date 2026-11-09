import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { EngineService } from './engine.service.js';
import { parsePositiveI128 } from './engine.util.js';

const TOKEN = 'CD26OANM4I4GF2GBC47UYTSP3FUBZRQ7WGMGECEQHMZ2D6QV2LXJTNIS';
const CONTRACT = 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX';

describe('parsePositiveI128', () => {
  it.each([['1', 1n], ['170141183460469231731687303715884105727', (1n << 127n) - 1n]])('accepts %s', (v, e) => {
    expect(parsePositiveI128(v)).toBe(e);
  });
  it.each(['0', '-1', '1.5', '', ' 1', '170141183460469231731687303715884105728', 5, null, undefined])('rejects %p', (v) => {
    expect(parsePositiveI128(v)).toBeNull();
  });
});

describe('EngineService', () => {
  const sender = Keypair.random().publicKey();
  const recipient = Keypair.random().publicKey();
  const relayer = Keypair.random();
  let prisma: any;
  let stellar: any;
  let contract: Record<string, jest.Mock<(...args: any[]) => Promise<any>>>;
  let env: Record<string, string>;
  let service: EngineService;

  beforeEach(() => {
    env = { RELAYER_PUBLIC_KEY: relayer.publicKey(), CONTRACT_ID: CONTRACT };
    contract = {
      get_offline_key: jest.fn(), set_offline_key: jest.fn(), get_registrar: jest.fn(),
      get_recipient: jest.fn(), register_recipient: jest.fn(), deposit: jest.fn(), withdraw: jest.fn(),
    };
    prisma = {
      token: { findUnique: jest.fn(async () => ({ id: 1, contractId: TOKEN, symbol: 'PHPC', isActive: true })) },
      account: { findUnique: jest.fn(), update: jest.fn() },
      onlineTransfer: { upsert: jest.fn() },
    };
    stellar = {
      networkPassphrase: Networks.TESTNET,
      getContract: jest.fn(async () => contract),
      sorobanServer: { getAccount: jest.fn(), simulateTransaction: jest.fn() },
    };
    const config = {
      get: (k: string) => env[k],
      getOrThrow: (k: string) => { if (!env[k]) throw new Error(k); return env[k]; },
    };
    service = new EngineService(prisma, stellar, config as any);
  });

  describe('prepareDeposit', () => {
    const base = () => ({ senderPublicKey: sender, tokenAddress: TOKEN, offlineDevicePubkeyHex: 'ab'.repeat(32), amountStroops: '100' });
    it('rejects missing fields', async () => {
      await expect(service.prepareDeposit({})).rejects.toThrow(BadRequestException);
    });
    it('rejects bad sender, bad device key and bad amount', async () => {
      await expect(service.prepareDeposit({ ...base(), senderPublicKey: 'nope' })).rejects.toThrow('Invalid senderPublicKey');
      await expect(service.prepareDeposit({ ...base(), offlineDevicePubkeyHex: 'abcd' })).rejects.toThrow('64-char hex');
      await expect(service.prepareDeposit({ ...base(), amountStroops: '-5' })).rejects.toThrow('positive integer');
    });
    it('rejects inactive tokens before touching the chain', async () => {
      prisma.token.findUnique.mockResolvedValue({ id: 1, contractId: TOKEN, isActive: false });
      await expect(service.prepareDeposit(base())).rejects.toThrow('Unsupported or inactive token');
      expect(stellar.getContract).not.toHaveBeenCalled();
    });
    it('fails closed when the relayer key is not configured', async () => {
      delete env.RELAYER_PUBLIC_KEY;
      await expect(service.prepareDeposit(base())).rejects.toThrow(InternalServerErrorException);
    });
    it('wraps simulation failures as a 500', async () => {
      contract.deposit.mockResolvedValue({ built: {}, simulation: { error: 'boom' } });
      await expect(service.prepareDeposit(base())).rejects.toThrow('Failed to prepare deposit transaction: Soroban simulation failed: boom');
    });
  });

  describe('prepareWithdraw', () => {
    it('validates input', async () => {
      await expect(service.prepareWithdraw({ senderPublicKey: sender })).rejects.toThrow(BadRequestException);
      await expect(service.prepareWithdraw({ senderPublicKey: sender, tokenAddress: TOKEN, amountStroops: '0' })).rejects.toThrow('positive integer');
    });
    it('wraps simulation failures', async () => {
      contract.withdraw.mockResolvedValue({ built: {}, simulation: { error: 'insufficient' } });
      await expect(service.prepareWithdraw({ senderPublicKey: sender, tokenAddress: TOKEN, amountStroops: '5' }))
        .rejects.toThrow('Soroban simulation failed: Soroban simulation failed: insufficient');
    });
  });

  describe('prepareTransfer', () => {
    const base = () => ({ senderPublicKey: sender, recipientPublicKey: recipient, tokenAddress: TOKEN, amountStroops: '10', paymentMode: 'online', clientProtocol: 2 });
    it('requires the explicit online v2 protocol (426)', async () => {
      const err: any = await service.prepareTransfer({ ...base(), clientProtocol: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiResponseException);
      expect(err.getStatus()).toBe(426);
      expect(err.getResponse()).toMatchObject({ code: 'ONLINE_TRANSFER_PROTOCOL_REQUIRED' });
    });
    it('rejects invalid keys and amounts', async () => {
      await expect(service.prepareTransfer({ ...base(), recipientPublicKey: 'x' })).rejects.toThrow('Invalid public key format');
      await expect(service.prepareTransfer({ ...base(), amountStroops: 'abc' })).rejects.toThrow('positive integer');
    });
    it('surfaces simulation errors without persisting a transfer', async () => {
      stellar.sorobanServer.getAccount.mockResolvedValue({ accountId: () => relayer.publicKey(), sequenceNumber: () => '1', incrementSequenceNumber() {} });
      stellar.sorobanServer.simulateTransaction.mockResolvedValue({ error: 'bad' });
      await expect(service.prepareTransfer(base())).rejects.toThrow('Failed to prepare transfer transaction');
      expect(prisma.onlineTransfer.upsert).not.toHaveBeenCalled();
    });
  });

  describe('offline key', () => {
    const device = Keypair.random();
    it('validates the device key and requires a registered account', async () => {
      await expect(service.prepareOfflineKey(sender, { offlineDeviceKey: 'bad' })).rejects.toThrow(BadRequestException);
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.prepareOfflineKey(sender, { offlineDeviceKey: device.publicKey() })).rejects.toThrow(NotFoundException);
    });
    it('returns synced and stores the key when the chain already matches', async () => {
      prisma.account.findUnique.mockResolvedValue({ id: 1 });
      contract.get_offline_key.mockResolvedValue({ result: device.rawPublicKey() });
      await expect(service.prepareOfflineKey(sender, { offlineDeviceKey: device.publicKey() })).resolves.toEqual({ status: 'synced' });
      expect(prisma.account.update).toHaveBeenCalledWith({ where: { stellarPublicKey: sender }, data: { offlineDeviceKey: device.publicKey() } });
    });
    it('confirm returns 409 until the key is on-chain, then persists it', async () => {
      contract.get_offline_key.mockResolvedValue({ result: undefined });
      const err: any = await service.confirmOfflineKey(sender, { offlineDeviceKey: device.publicKey() }).catch((e) => e);
      expect(err.getStatus()).toBe(409);
      expect(prisma.account.update).not.toHaveBeenCalled();
      contract.get_offline_key.mockResolvedValue({ result: device.rawPublicKey() });
      await expect(service.confirmOfflineKey(sender, { offlineDeviceKey: device.publicKey() })).resolves.toEqual({ status: 'synced' });
    });
  });

  describe('registerRecipient', () => {
    const registrar = Keypair.random();
    beforeEach(() => {
      env.REGISTRAR_SECRET_KEY = registrar.secret();
      prisma.account.findUnique.mockResolvedValue({ shortId: 'ABC123', stellarPublicKey: sender });
      prisma.token.findUnique.mockResolvedValue({ id: 7, symbol: 'PHPC', contractId: TOKEN });
    });
    it('404s for an unregistered account', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.registerRecipient(sender)).rejects.toThrow(NotFoundException);
    });
    it('refuses to run when the on-chain registrar differs', async () => {
      contract.get_registrar.mockResolvedValue({ result: Keypair.random().publicKey() });
      await expect(service.registerRecipient(sender)).rejects.toThrow('does not match the registrar');
    });
    it('409s when the short ID belongs to another address', async () => {
      contract.get_registrar.mockResolvedValue({ result: registrar.publicKey() });
      contract.get_recipient.mockResolvedValue({ result: Keypair.random().publicKey() });
      const err: any = await service.registerRecipient(sender).catch((e) => e);
      expect(err.getStatus()).toBe(409);
    });
    it('is idempotent and returns the offline config when already registered', async () => {
      contract.get_registrar.mockResolvedValue({ result: registrar.publicKey() });
      contract.get_recipient.mockResolvedValue({ result: sender });
      const out = await service.registerRecipient(sender);
      expect(out.status).toBe('already_registered');
      expect(contract.register_recipient).not.toHaveBeenCalled();
      expect(out.offlineConfig).toMatchObject({ contractId: CONTRACT, tokenContractId: TOKEN, tokenDbId: '7', tokenSymbol: 'PHPC' });
    });
    it('rejects a REGISTRAR_PUBLIC_KEY that does not match the secret', async () => {
      env.REGISTRAR_PUBLIC_KEY = Keypair.random().publicKey();
      await expect(service.registerRecipient(sender)).rejects.toThrow('REGISTRAR_PUBLIC_KEY does not match');
    });
  });
});
