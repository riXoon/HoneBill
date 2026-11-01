import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Account, Keypair, Networks, Operation, Transaction, TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import { LockService } from '../../../../src/infra/lock/lock.service';
import { PrismaService } from '../../../../src/infra/prisma/prisma.service';
import { StellarService } from '../../../../src/infra/stellar/stellar.service';
import { StellarTransactionManager, SpendOfflineContractArgs } from '../../../../src/infra/stellar/stellar-transaction-manager.service';

describe('StellarTransactionManager', () => {
  let manager: StellarTransactionManager;
  let rpcServer: Record<string, jest.Mock>;
  const relayer = Keypair.random();
  const sender = Keypair.random();
  const token = 'CD26OANM4I4GF2GBC47UYTSP3FUBZRQ7WGMGECEQHMZ2D6QV2LXJTNIS';
  const args: SpendOfflineContractArgs = {
    gateway: relayer.publicKey(),
    sender: sender.publicKey(),
    token,
    receiver_short_id: Buffer.from('rcv123', 'ascii'),
    amount: 10_000_000n,
    protocol_toll: 5_000_000n,
    nonce: Buffer.alloc(32, 1),
    signature: Buffer.alloc(64, 2),
  };

  beforeEach(() => {
    rpcServer = {
      getAccount: jest.fn(async (publicKey: string) => new Account(publicKey, '100')),
      prepareTransaction: jest.fn(async (tx: Transaction) => tx),
      sendTransaction: jest.fn(async () => ({ status: 'PENDING', hash: 'tx-hash' })),
      getTransaction: jest.fn(),
    };
    manager = new StellarTransactionManager(
      { sorobanServer: rpcServer, networkPassphrase: Networks.TESTNET } as unknown as StellarService,
      {} as PrismaService,
      {} as LockService,
      { get: () => 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX' } as unknown as ConfigService,
    );
  });

  it('calculates a deterministic 64-character transaction hash', () => {
    const account = new Account(relayer.publicKey(), '100');
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: relayer.publicKey(), asset: (require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk')).Asset.native(), amount: '1' }))
      .setTimeout(30)
      .build();
    tx.sign(relayer);
    expect(tx.hash().toString('hex')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds, prepares and signs a spend transaction before extracting its hash', async () => {
    const prepared = await manager.buildAndSignSpendOfflineTx(args, relayer.secret());
    expect(rpcServer.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(prepared.signerAddress).toBe(relayer.publicKey());
    expect(prepared.txHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.transaction.hash().toString('hex')).toBe(prepared.txHash);
    expect(prepared.signedTxXdr.length).toBeGreaterThan(50);
  });

  it('normalizes Soroban simulation errors during preparation', async () => {
    rpcServer.prepareTransaction.mockRejectedValue(new Error('HostError: Error(Contract, #6)'));
    await expect(manager.buildAndSignSpendOfflineTx(args, relayer.secret()))
      .rejects.toThrow('Soroban simulation failed during transaction preparation: HostError: Error(Contract, #6)');
  });

  it('surfaces submission error details from Soroban RPC', async () => {
    rpcServer.sendTransaction.mockResolvedValue({ status: 'ERROR', errorResultXdr: 'AAAAAAA=' });
    const account = new Account(relayer.publicKey(), '1');
    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: sender.publicKey(), asset: (require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk')).Asset.native(), amount: '1' }))
      .setTimeout(30).build();
    tx.sign(relayer);
    await expect(manager.submitSignedTransaction(tx)).rejects.toThrow(/status=ERROR.*AAAAAAA=/);
  });

  it('returns successful confirmation details', async () => {
    const hash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    rpcServer.getTransaction.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: 'success_val' });
    await expect(manager.pollTransactionConfirmation(hash, { maxAttempts: 2, intervalMs: 1 }))
      .resolves.toMatchObject({ status: 'SUCCESS', txHash: hash, returnValue: 'success_val' });
  });

  it('returns failed transaction result XDR', async () => {
    const hash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    rpcServer.getTransaction.mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.FAILED,
      resultXdr: { toXDR: () => 'result_err_xdr' },
    });
    await expect(manager.pollTransactionConfirmation(hash)).resolves.toMatchObject({
      status: 'FAILED', txHash: hash, errorResultXdr: 'result_err_xdr',
    });
  });

  it('returns NOT_FOUND after bounded polling attempts', async () => {
    const hash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    rpcServer.getTransaction.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.NOT_FOUND });
    await expect(manager.pollTransactionConfirmation(hash, { maxAttempts: 3, intervalMs: 1 }))
      .resolves.toMatchObject({ status: 'NOT_FOUND', txHash: hash });
    expect(rpcServer.getTransaction).toHaveBeenCalledTimes(3);
  });
});
