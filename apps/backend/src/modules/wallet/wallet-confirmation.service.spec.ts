import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Account, Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StellarService } from '../../infra/stellar/stellar.service.js';
import { WalletConfirmationService } from './wallet-confirmation.service.js';
import { WalletHistoryRecoveryService } from './wallet-history-recovery.service.js';

const SENDER = Keypair.random().publicKey();
const RECIPIENT = Keypair.random().publicKey();
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 1));
const VAULT = StrKey.encodeContract(Buffer.alloc(32, 2));
const AMOUNT = 9_007_199_254_740_993n;
const scAddress = (value: string) => new Address(value).toScVal();
const scAmount = (value: bigint) => nativeToScVal(value, { type: 'i128' });
const scSymbol = (value: string) => nativeToScVal(value, { type: 'symbol' });

function event(contract: string, topics: xdr.ScVal[], data: xdr.ScVal) {
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0), type: xdr.ContractEventType.contract(), contractId: StrKey.decodeContract(contract) as unknown as xdr.ContractId,
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics, data })),
  });
}

function chain(kind: 'transfer' | 'deposit' | 'withdraw', amount = AMOUNT) {
  const to = kind === 'transfer' ? RECIPIENT : VAULT;
  const args = kind === 'transfer'
    ? [scAddress(SENDER), scAddress(RECIPIENT), scAmount(AMOUNT)]
    : [scAddress(SENDER), scAddress(TOKEN), ...(kind === 'deposit' ? [xdr.ScVal.scvBytes(Buffer.alloc(32, 3))] : []), scAmount(AMOUNT)];
  const transaction = new TransactionBuilder(new Account(SENDER, '100'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(kind === 'transfer' ? TOKEN : VAULT).call(kind, ...args)).setTimeout(30).build();
  const transfer = event(TOKEN, [
    scSymbol('transfer'), scAddress(kind === 'withdraw' ? VAULT : SENDER), scAddress(kind === 'withdraw' ? SENDER : to),
    nativeToScVal('asset', { type: 'string' }),
  ], scAmount(amount));
  const events = [transfer];
  if (kind !== 'transfer') {
    const data = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: scSymbol('amount'), val: scAmount(AMOUNT) }),
      new xdr.ScMapEntry({ key: scSymbol('sender'), val: scAddress(SENDER) }),
      new xdr.ScMapEntry({ key: scSymbol('token'), val: scAddress(TOKEN) }),
    ]);
    events.push(event(VAULT, [scSymbol(kind), scAddress(SENDER), scAddress(TOKEN)], data));
  }
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS, txHash: transaction.hash().toString('hex'), envelopeXdr: transaction.toEnvelope(),
    ledger: 1200, createdAt: 1700000000, events: { contractEventsXdr: [events] },
  };
}

function fixture(mode = 'apply') {
  const stored = { tokenId: 1, token: { contractId: TOKEN }, status: 'PENDING', confirmedLedger: null, amountStroops: AMOUNT };
  const transfer = {
    findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ ...stored, senderPublicKey: SENDER, recipientPublicKey: RECIPIENT }),
    updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
    createMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
  };
  const move = {
    ...transfer,
    findFirst: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ ...stored, accountPublicKey: SENDER, direction: 'TO_OFFLINE' }),
    updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
    createMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
  };
  const cursors = new Map<string, string>();
  const db = {
    walletMove: move, onlineTransfer: transfer,
    token: { findMany: async () => [{ id: 1, contractId: TOKEN }] },
    account: { findMany: async () => [{ stellarPublicKey: SENDER }] },
    walletHistoryCursor: {
      findUnique: async ({ where: { scope } }: { where: { scope: string } }) => cursors.has(scope) ? { cursor: cursors.get(scope) } : null,
      updateMany: async ({ where, data }: any) => {
        if (cursors.get(where.scope) !== where.cursor) return { count: 0 };
        cursors.set(where.scope, data.cursor);
        return { count: 1 };
      },
      createMany: async ({ data }: any) => {
        if (cursors.has(data.scope)) return { count: 0 };
        cursors.set(data.scope, data.cursor);
        return { count: 1 };
      },
    },
  };
  const transaction = jest.fn(async (work: (tx: typeof db) => Promise<unknown>) => {
    const snapshot = [...cursors];
    try { return await work(db); } catch (error) {
      cursors.clear();
      for (const [key, cursor] of snapshot) cursors.set(key, cursor);
      throw error;
    }
  });
  const prisma = { ...db, $transaction: transaction } as unknown as PrismaService;
  const stellar = {
    networkPassphrase: Networks.TESTNET,
    sorobanServer: {
      getNetwork: async () => ({ passphrase: Networks.TESTNET }),
      getTransaction: jest.fn<(...args: any[]) => Promise<any>>(),
      getEvents: jest.fn<(...args: any[]) => Promise<any>>(),
    },
  };
  const config = new ConfigService({ CONTRACT_ID: VAULT, WALLET_HISTORY_RECONCILE_MODE: mode, WALLET_HISTORY_RECONCILE_START_LEDGER: 1100 });
  const confirmation = new WalletConfirmationService(prisma, stellar as unknown as StellarService, config);
  const recovery = new WalletHistoryRecoveryService(prisma, stellar as unknown as StellarService, config, confirmation);
  return { confirmation, recovery, config, rpc: stellar.sorobanServer, move, transfer, cursors };
}

describe('wallet confirmations', () => {
  it('checks ownership before asking Stellar and gives unknown and unrelated hashes the same response', async () => {
    const f = fixture();
    f.transfer.findFirst.mockResolvedValue(null);
    const hash = chain('transfer').txHash;
    await expect(f.confirmation.confirm('transfer', SENDER, hash)).rejects.toMatchObject({ status: 404 });
    expect(f.transfer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { txHash: hash, OR: [{ senderPublicKey: SENDER }, { recipientPublicKey: SENDER }] },
    }));
    expect(f.rpc.getTransaction).not.toHaveBeenCalled();
  });

  it.each(['NOT_FOUND', 'UNRECOGNIZED'])('keeps %s pending', async (status) => {
    const f = fixture();
    const hash = chain('deposit').txHash;
    f.rpc.getTransaction.mockResolvedValue({ status, txHash: hash });
    await expect(f.confirmation.confirm('move', SENDER, hash)).rejects.toMatchObject({ status: 409 });
    expect(f.move.updateMany).not.toHaveBeenCalled();
  });

  it('requires the actual token effect and matching amount to settle', async () => {
    const f = fixture();
    const wrong = chain('transfer', AMOUNT - 1n);
    f.rpc.getTransaction.mockResolvedValue(wrong);
    await expect(f.confirmation.confirm('transfer', RECIPIENT, wrong.txHash)).rejects.toMatchObject({ status: 409 });
    const good = chain('transfer');
    f.rpc.getTransaction.mockResolvedValue(good);
    await expect(f.confirmation.confirm('transfer', RECIPIENT, good.txHash)).resolves.toMatchObject({
      txHash: good.txHash, status: 'SETTLED', confirmedAt: new Date(1700000000000),
    });
    expect(f.transfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ confirmedLedger: 1200n }),
    }));
  });

  it('keeps a failed history write retryable', async () => {
    const f = fixture();
    const tx = chain('deposit');
    f.rpc.getTransaction.mockResolvedValue(tx);
    f.move.updateMany.mockRejectedValue(new Error('database unavailable'));
    await expect(f.confirmation.confirm('move', SENDER, tx.txHash)).rejects.toThrow('database unavailable');
    expect(f.move.createMany).not.toHaveBeenCalled();
  });

  it('only records an explicit failed outcome for the matching envelope', async () => {
    const f = fixture();
    const tx = chain('deposit');
    f.rpc.getTransaction.mockResolvedValue({ ...tx, status: 'FAILED' });
    await expect(f.confirmation.confirm('move', SENDER, tx.txHash)).rejects.toMatchObject({ status: 422 });
    expect(f.move.updateMany).toHaveBeenCalledWith({ where: { txHash: tx.txHash, status: 'PENDING' }, data: { status: 'FAILED' } });
  });
});

describe('scheduled wallet history recovery', () => {
  function setPage(f: ReturnType<typeof fixture>, tx: ReturnType<typeof chain>, contract = VAULT) {
    f.rpc.getEvents.mockImplementation(async (request: any) => request.filters[0].contractIds[0] === contract
      ? { cursor: 'advanced', events: request.cursor ? [] : [{ contractId: new Contract(contract), type: 'contract', ledger: tx.ledger, txHash: tx.txHash }] }
      : { cursor: 'empty', events: [] });
    f.rpc.getTransaction.mockResolvedValue(tx);
  }

  it('observes verified effects without writing history', async () => {
    const f = fixture('observe');
    setPage(f, chain('withdraw'));
    await expect(f.recovery.run()).resolves.toMatchObject({ mode: 'observe', verified: 1, created: 0, errors: 0 });
    expect(f.move.updateMany).not.toHaveBeenCalled();
    f.config.set('WALLET_HISTORY_RECONCILE_MODE', 'apply');
    await expect(f.recovery.run()).resolves.toMatchObject({ mode: 'apply', verified: 1, updated: 1, errors: 0 });
  });

  it('recreates a missing move and never projects its nested transfer as an online send', async () => {
    const f = fixture();
    const tx = chain('deposit');
    f.move.updateMany.mockResolvedValue({ count: 0 });
    f.rpc.getEvents.mockImplementation(async (request: any) => {
      const contract = request.filters[0].contractIds[0];
      return { cursor: 'advanced', events: request.cursor ? [] : [{ contractId: new Contract(contract), type: 'contract', ledger: tx.ledger, txHash: tx.txHash }] };
    });
    f.rpc.getTransaction.mockResolvedValue(tx);
    await expect(f.recovery.run()).resolves.toMatchObject({ verified: 1, created: 1, skipped: 1, errors: 0 });
    expect(f.move.createMany).toHaveBeenCalledWith({ data: expect.objectContaining({ txHash: tx.txHash, direction: 'TO_OFFLINE' }), skipDuplicates: true });
    await expect(f.recovery.run()).resolves.toMatchObject({ verified: 0, created: 0, errors: 0 });
    expect(f.move.createMany).toHaveBeenCalledTimes(1);
    expect(f.transfer.createMany).not.toHaveBeenCalled();
  });

  it('leaves the checkpoint available for retry when a history write fails', async () => {
    const f = fixture();
    setPage(f, chain('transfer'), TOKEN);
    f.transfer.updateMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.recovery.run()).resolves.toMatchObject({ errors: 1, updated: 0 });
    expect([...f.cursors.values()]).not.toContain('advanced');
    await expect(f.recovery.run()).resolves.toMatchObject({ errors: 0, verified: 1, updated: 1 });
  });
});
