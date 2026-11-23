import { describe, expect, it, jest } from '@jest/globals';
import { Account, Contract, Keypair, Networks, rpc, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarTransactionManager } from './stellar-transaction-manager.service.js';

const CONTRACT = 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX';

function managerFixture() {
  const signer = Keypair.random();
  const account = new Account(signer.publicKey(), '100');
  const transaction = new TransactionBuilder(new Account(signer.publicKey(), '100'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(CONTRACT).call('spend_offline'))
    .setTimeout(60).build();
  const args = spendArgs(signer, Keypair.random());
  const input = {
    settlementId: 1, args, receiverAddress: Keypair.random().publicKey(),
    relayerSecretKey: signer.secret(), maxPollAttempts: 1,
  };
  const stored = {
    id: 1, status: 'PENDING', failReason: null, txHash: null as string | null, signedTxXdr: null as string | null,
    nonce: args.nonce.toString('base64'), receiverShortId: 'rcv123', amountStroops: 100n, relayerAddress: signer.publicKey(),
    recoveryReview: null as string | null,
  };
  const events: string[] = [];
  const attempts = new Map<string, Record<string, unknown>>();
  const prisma = {
    settlement: {
      findUnique: jest.fn(async () => ({ ...stored })),
      update: jest.fn(async ({ data: { attempts: change, ...current } }: any) => {
        if (change.create) attempts.set(change.create.txHash, change.create);
        if (change.upsert) {
          const { create, update } = change.upsert;
          const existing = attempts.get(create.txHash);
          attempts.set(create.txHash, existing ? { ...existing, ...update } : create);
        }
        Object.assign(stored, current);
        events.push('persist');
      }),
    },
    settlementAttempt: {
      findUnique: jest.fn(async ({ where }: { where: { settlementId_txHash: { txHash: string } } }) =>
        attempts.get(where.settlementId_txHash.txHash) ?? null),
    },
  };
  const stellar = { networkPassphrase: Networks.TESTNET, sorobanServer: {
    getAccount: jest.fn(async () => account),
    prepareTransaction: jest.fn(async (tx: Transaction) => tx),
    sendTransaction: jest.fn(async () => { events.push('send'); return { status: 'PENDING' } as any; }),
    getTransaction: jest.fn(async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: 'ok' } as any)),
  } };
  const locks = { acquire: jest.fn(async () => true), release: jest.fn(async () => true) };
  const config = { getOrThrow: jest.fn(() => CONTRACT) };
  return {
    service: new StellarTransactionManager(prisma as any, stellar as any, locks as any, config as any),
    input, transaction, stored, events, attempts, prisma, stellar,
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
    const result = await f.service.executeTwoPhaseSettlement(f.input);
    expect(f.events).toEqual(['persist', 'send']);
    expect(f.stored.signedTxXdr).toBeTruthy();
    expect(result.txHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pollResult.status).toBe('SUCCESS');
    const signed = TransactionBuilder.fromXDR(f.stored.signedTxXdr!, Networks.TESTNET) as Transaction;
    expect(f.prisma.settlement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1, status: 'PENDING', txHash: null, signedTxXdr: null },
    }));
    expect(f.attempts.get(result.txHash)).toMatchObject({
      txHash: result.txHash, signedTxXdr: f.stored.signedTxXdr, nonce: f.stored.nonce,
      senderAddress: f.input.args.sender, receiverAddress: f.input.receiverAddress,
      receiverShortId: 'rcv123', tokenContractId: f.input.args.token, contractId: CONTRACT,
      gatewayAddress: f.input.args.gateway, amountStroops: 100n, protocolToll: 0n,
      sourceSequence: 101n, minTime: 0n, maxTime: BigInt(signed.timeBounds!.maxTime), networkId: expect.any(String),
    });
  });

  it('reuses an already persisted signed envelope on retry', async () => {
    const f = managerFixture();
    const { txHash } = await f.service.executeTwoPhaseSettlement(f.input);
    await f.service.executeTwoPhaseSettlement(f.input);
    expect(f.stellar.sorobanServer.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(f.prisma.settlement.update).toHaveBeenCalledTimes(1);
    expect(f.attempts.get(txHash)).toMatchObject({ receiverAddress: f.input.receiverAddress });
  });

  it('records a legacy envelope before rebroadcast without inferring the old payment intent', async () => {
    const f = managerFixture();
    f.stored.txHash = f.transaction.hash().toString('hex');
    f.stored.signedTxXdr = f.transaction.toXDR();
    f.stellar.sorobanServer.getTransaction.mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.NOT_FOUND });
    await f.service.resumeTwoPhaseSettlement({
      settlementId: 1, txHash: f.stored.txHash, signedTxXdr: f.stored.signedTxXdr, maxPollAttempts: 1,
    });
    expect(f.stellar.sorobanServer.prepareTransaction).not.toHaveBeenCalled();
    expect(f.events).toEqual(['persist', 'send']);
    expect(f.stored.recoveryReview).toBe('LEGACY_INTENT_UNVERIFIED');
    expect(f.attempts.get(f.stored.txHash)).toMatchObject({ signedTxXdr: f.stored.signedTxXdr });
    expect(f.attempts.get(f.stored.txHash)).not.toHaveProperty('receiverAddress');
  });

  it('never broadcasts when the attempt write fails', async () => {
    const f = managerFixture();
    f.prisma.settlement.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.service.executeTwoPhaseSettlement(f.input)).rejects.toMatchObject({ status: 503 });
    expect(f.stellar.sorobanServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('preserves the attempt when the network response is lost', async () => {
    const f = managerFixture();
    f.stellar.sorobanServer.sendTransaction.mockRejectedValueOnce(new Error('connection reset'));
    await expect(f.service.executeTwoPhaseSettlement(f.input)).rejects.toThrow('connection reset');
    expect(f.attempts.get(f.stored.txHash!)).toMatchObject({ receiverAddress: f.input.receiverAddress });
    expect(f.stored.status).toBe('PENDING');
  });

  it('does not sign a replacement for incomplete legacy evidence or a terminal row', async () => {
    const f = managerFixture();
    f.stored.txHash = f.transaction.hash().toString('hex');
    await expect(f.service.executeTwoPhaseSettlement(f.input)).rejects.toMatchObject({ status: 503 });
    f.stored.status = 'SETTLED';
    await expect(f.service.executeTwoPhaseSettlement(f.input)).rejects.toMatchObject({ status: 409 });
    expect(f.stellar.sorobanServer.prepareTransaction).not.toHaveBeenCalled();
    expect(f.stellar.sorobanServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('stops polling at the configured attempt limit', async () => {
    const f = managerFixture();
    f.stellar.sorobanServer.getTransaction.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as any);
    const result = await f.service.pollTransactionConfirmation('a'.repeat(64), { maxAttempts: 2, intervalMs: 0 });
    expect(result.status).toBe('NOT_FOUND');
    expect(f.stellar.sorobanServer.getTransaction).toHaveBeenCalledTimes(2);
  });
});
