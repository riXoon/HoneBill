import { describe, expect, it, jest } from '@jest/globals';
import { Account, Keypair, Networks, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarTransactionManager } from './stellar-transaction-manager.service.js';

function managerFixture() {
  const signer = Keypair.random();
  const account = new Account(signer.publicKey(), '100');
  const transaction = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new (require('@stellar/stellar-sdk').Contract)(
      'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX',
    ).call('spend_offline'))
    .setTimeout(60).build();
  const stored: { txHash?: string; signedTxXdr?: string } = {};
  const events: string[] = [];
  const prisma = { settlement: {
    findUnique: jest.fn(async () => stored.txHash && stored.signedTxXdr ? { ...stored } : null),
    update: jest.fn(async ({ data }: any) => { Object.assign(stored, data); events.push('persist'); }),
  } };
  const stellar = { networkPassphrase: Networks.TESTNET, sorobanServer: {
    getAccount: jest.fn(async () => account),
    prepareTransaction: jest.fn(async () => transaction),
    sendTransaction: jest.fn(async () => { events.push('send'); return { status: 'PENDING' } as any; }),
    getTransaction: jest.fn(async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: 'ok' } as any)),
  } };
  const locks = { acquire: jest.fn(async () => true), release: jest.fn(async () => true) };
  const config = { getOrThrow: jest.fn(() => 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX') };
  return {
    service: new StellarTransactionManager(prisma as any, stellar as any, locks as any, config as any),
    signer, transaction, stored, events, prisma, stellar,
  };
}

const spendArgs = (gateway: Keypair, sender: Keypair) => ({
  gateway: gateway.publicKey(), sender: sender.publicKey(),
  token: 'CD26OANM4I4GF2GBC47UYTSP3FUBZRQ7WGMGECEQHMZ2D6QV2LXJTNIS',
  receiver_short_id: Buffer.from('rcv123'), amount: 100n, protocol_toll: 0n,
  nonce: Buffer.alloc(32, 1), signature: Buffer.alloc(64, 2),
});

describe('StellarTransactionManager', () => {
  it('persists signed XDR before broadcasting and returns confirmation', async () => {
    const f = managerFixture();
    const result = await f.service.executeTwoPhaseSettlement({
      settlementId: 1, args: spendArgs(f.signer, Keypair.random()), relayerSecretKey: f.signer.secret(), maxPollAttempts: 1,
    });
    expect(f.events).toEqual(['persist', 'send']);
    expect(f.stored.signedTxXdr).toBeTruthy();
    expect(result.txHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pollResult.status).toBe('SUCCESS');
  });

  it('reuses an already persisted signed envelope on retry', async () => {
    const f = managerFixture();
    f.stored.txHash = f.transaction.hash().toString('hex');
    f.stored.signedTxXdr = f.transaction.toXDR();
    await f.service.executeTwoPhaseSettlement({
      settlementId: 1, args: spendArgs(f.signer, Keypair.random()), relayerSecretKey: f.signer.secret(), maxPollAttempts: 1,
    });
    expect(f.stellar.sorobanServer.prepareTransaction).not.toHaveBeenCalled();
    expect(f.prisma.settlement.update).not.toHaveBeenCalled();
  });

  it('stops polling at the configured attempt limit', async () => {
    const f = managerFixture();
    f.stellar.sorobanServer.getTransaction.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as any);
    const result = await f.service.pollTransactionConfirmation('a'.repeat(64), { maxAttempts: 2, intervalMs: 0 });
    expect(result.status).toBe('NOT_FOUND');
    expect(f.stellar.sorobanServer.getTransaction).toHaveBeenCalledTimes(2);
  });
});
