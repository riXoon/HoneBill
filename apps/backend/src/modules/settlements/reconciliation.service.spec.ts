import { describe, expect, it, jest } from '@jest/globals';
import { Address, Contract, Keypair, Networks, StrKey, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { stellarNetworkId } from '../../infra/stellar/network-id.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StellarService } from '../../infra/stellar/stellar.service.js';
import { SettlementReconciliationService } from './reconciliation.util.js';
import { SettlementEventIndexService } from './settlement-event-index.service.js';

const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 1));
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 2));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));
const SENDER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();
const RECEIVER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 5)).publicKey();
const GATEWAY = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 6)).publicKey();
const NONCE = Buffer.alloc(32, 7);
const HASH = 'a'.repeat(64);
const SECOND_HASH = 'b'.repeat(64);
const NETWORK_ID = stellarNetworkId(Networks.TESTNET);
const attempt = {
  txHash: HASH, contractId: CONTRACT, networkId: NETWORK_ID, nonce: NONCE.toString('base64').replace(/=+$/, ''),
  senderAddress: SENDER, receiverAddress: RECEIVER, receiverShortId: 'recv01', gatewayAddress: GATEWAY,
  tokenContractId: TOKEN, amountStroops: 9007199254740993n, protocolToll: 5000000n,
  maxTime: 1000n, maxLedger: null,
};
type EventFields = {
  sender: string; receiver: string; gateway: string; token: string; receiver_short_id: Buffer;
  amount: bigint; protocol_toll: bigint; nonce: Buffer;
};

function spendEvent(overrides: Partial<EventFields> = {}, emitter = CONTRACT): xdr.ContractEvent {
  const fields: EventFields = {
    sender: SENDER, receiver: RECEIVER, gateway: GATEWAY, token: TOKEN,
    receiver_short_id: Buffer.from('recv01'), nonce: NONCE, amount: attempt.amountStroops,
    protocol_toll: attempt.protocolToll, ...overrides,
  };
  const topics = [xdr.ScVal.scvSymbol('spend'), Address.fromString(fields.sender).toScVal(), Address.fromString(fields.token).toScVal()];
  const data = xdr.ScVal.scvMap(Object.entries(fields).map(([name, value]) => new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol(name),
    val: typeof value === 'string' ? Address.fromString(value).toScVal() :
      typeof value === 'bigint' ? nativeToScVal(value, { type: 'i128' }) : xdr.ScVal.scvBytes(value),
  })));
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0), contractId: StrKey.decodeContract(emitter) as unknown as xdr.ContractId,
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics, data })),
  });
}

const successful = (events: xdr.ContractEvent[], txHash = HASH) => ({
  status: rpc.Api.GetTransactionStatus.SUCCESS, txHash, ledger: 34, events: { contractEventsXdr: [events] },
});
const missing = (latestLedgerCloseTime: number | string = 900) => ({
  status: rpc.Api.GetTransactionStatus.NOT_FOUND, txHash: HASH, latestLedgerCloseTime, latestLedger: 40,
});

function fixture() {
  const archive = {
    networkId: NETWORK_ID, contractId: CONTRACT, ledger: 34n, eventId: 'event-34', txHash: HASH,
    senderAddress: SENDER, receiverAddress: RECEIVER, receiverShortId: 'recv01', gatewayAddress: GATEWAY,
    tokenContractId: TOKEN, amountStroops: attempt.amountStroops.toString(), protocolToll: attempt.protocolToll.toString(),
    nonce: NONCE.toString('base64'),
  };
  const settlement = { nonce: attempt.nonce, recoveryReview: null, attempts: [attempt] };
  const sorobanServer = {
    getNetwork: jest.fn<() => Promise<unknown>>().mockResolvedValue({ passphrase: Networks.TESTNET }),
    getTransaction: jest.fn<(hash: string) => Promise<unknown>>(),
    getEvents: jest.fn<(request: rpc.Api.GetEventsRequest) => Promise<unknown>>(),
  };
  const prisma = {
    settlement: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(settlement),
      update: jest.fn(),
    },
    settlementSpendEvent: {
      findMany: jest.fn<(query: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      createMany: jest.fn<(query: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    settlementEventCursor: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      createMany: jest.fn<(query: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn<(query: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (work: (client: unknown) => Promise<unknown>) => work(prisma)),
  };
  const db = prisma as unknown as PrismaService;
  const stellar = { networkPassphrase: Networks.TESTNET, sorobanServer } as unknown as StellarService;
  return {
    reconcile: new SettlementReconciliationService(db, stellar), index: new SettlementEventIndexService(db, stellar),
    sorobanServer, prisma, archive, settlement,
  };
}

describe('settlement reconciliation', () => {
  it('reports only a fully matching successful spend and leaves settlement writes to the caller', async () => {
    const f = fixture();
    f.sorobanServer.getTransaction.mockResolvedValue(successful([spendEvent()]));
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'SETTLED', source: 'RPC_SPEND_EVENT', txHash: HASH, ledger: 34 });
    expect(f.prisma.settlement.update).not.toHaveBeenCalled();
  });

  it.each<[Partial<EventFields>]>([
    [{ receiver_short_id: Buffer.from('other1') }],
    [{ receiver: GATEWAY }], [{ sender: GATEWAY }], [{ gateway: RECEIVER }], [{ amount: attempt.amountStroops - 1n }],
    [{ protocol_toll: 0n }], [{ token: OTHER_CONTRACT }], [{ nonce: Buffer.alloc(32, 1) }],
  ])('requires the exact expected payment fields (%o)', async (fields) => {
    const f = fixture();
    f.sorobanServer.getTransaction.mockResolvedValue(successful([spendEvent(fields)]));
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'REVIEW', reason: 'EVIDENCE_MISMATCH' });
  });

  it.each([{ events: [] }, { events: [spendEvent({}, OTHER_CONTRACT)] }])('keeps an RPC success without a spend from the expected contract pending', async ({ events }) => {
    const f = fixture();
    f.sorobanServer.getTransaction.mockResolvedValue(successful(events));
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'PENDING', attempts: [{ txHash: HASH, status: 'UNKNOWN' }] });
  });

  it('reads transaction metadata when the RPC response has no standalone events', async () => {
    const f = fixture();
    const resultMetaXdr = new xdr.TransactionMeta(3, new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0), txChangesBefore: [], operations: [], txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: new xdr.SorobanTransactionMetaExt(0), events: [spendEvent()], returnValue: xdr.ScVal.scvVoid(),
        diagnosticEvents: [],
      }),
    }));
    f.sorobanServer.getTransaction.mockResolvedValue({ ...successful([]), resultMetaXdr });
    await expect(f.reconcile.reconcile(1)).resolves.toMatchObject({ status: 'SETTLED', txHash: HASH });
  });

  it('checks every persisted attempt when only the previous envelope was included', async () => {
    const f = fixture();
    f.prisma.settlement.findUnique.mockResolvedValue({ ...f.settlement, attempts: [attempt, { ...attempt, txHash: SECOND_HASH }] });
    f.sorobanServer.getTransaction.mockResolvedValueOnce(successful([spendEvent()])).mockResolvedValueOnce({ ...missing(), txHash: SECOND_HASH });
    await expect(f.reconcile.reconcile(1)).resolves.toMatchObject({ status: 'SETTLED', txHash: HASH });
    expect(f.sorobanServer.getTransaction).toHaveBeenNthCalledWith(2, SECOND_HASH);
  });

  it('recovers from the archive after the RPC history window has rolled over', async () => {
    const f = fixture();
    f.prisma.settlementSpendEvent.findMany.mockResolvedValue([f.archive]);
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'SETTLED', source: 'ARCHIVED_SPEND_EVENT', txHash: HASH, ledger: 34 });
    expect(f.sorobanServer.getTransaction).not.toHaveBeenCalled();
    expect(f.prisma.settlementSpendEvent.findMany).toHaveBeenCalledWith({
      where: { networkId: NETWORK_ID, nonce: NONCE.toString('base64'), contractId: { in: [CONTRACT] } }, take: 2,
    });
  });

  it('sends conflicting archived events and missing legacy intent for review', async () => {
    const f = fixture();
    f.prisma.settlementSpendEvent.findMany.mockResolvedValue([f.archive, { ...f.archive, txHash: SECOND_HASH }]);
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'REVIEW', reason: 'EVIDENCE_MISMATCH' });
    f.prisma.settlement.findUnique.mockResolvedValue({ ...f.settlement, recoveryReview: 'LEGACY_INTENT_UNVERIFIED' });
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'REVIEW', reason: 'MISSING_INTENT' });
  });

  it('records failed or expired attempts as observations and keeps the voucher pending', async () => {
    const f = fixture();
    f.sorobanServer.getTransaction.mockResolvedValueOnce(missing('1001'))
      .mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.FAILED, txHash: HASH, ledger: 34 });
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'PENDING', attempts: [{ txHash: HASH, status: 'ENVELOPE_EXPIRED' }] });
    await expect(f.reconcile.reconcile(1)).resolves.toEqual({ status: 'PENDING', attempts: [{ txHash: HASH, status: 'FAILED', ledger: 34 }] });
    expect(f.prisma.settlement.update).not.toHaveBeenCalled();
  });

  it('keeps the voucher pending when RPC is unavailable or connected to a different network', async () => {
    const f = fixture();
    f.sorobanServer.getTransaction.mockRejectedValueOnce(new Error('timeout'));
    await expect(f.reconcile.reconcile(1)).resolves.toMatchObject({ status: 'PENDING' });
    f.sorobanServer.getNetwork.mockResolvedValue({ passphrase: Networks.PUBLIC });
    await expect(f.reconcile.reconcile(1)).resolves.toMatchObject({ status: 'PENDING' });
    expect(f.sorobanServer.getTransaction).toHaveBeenCalledTimes(1);
  });
});

function eventPage() {
  const body = spendEvent().body().v0();
  return { cursor: 'cursor-next', events: [{
    id: 'event-34', type: 'contract', contractId: new Contract(CONTRACT), ledger: 34, txHash: HASH,
    topic: body.topics(), value: body.data(),
  }] };
}

describe('settlement event archive', () => {
  it('confirms, deduplicates and saves a page together with its durable checkpoint', async () => {
    const f = fixture();
    f.sorobanServer.getEvents.mockResolvedValue(eventPage());
    f.sorobanServer.getTransaction.mockResolvedValue(successful([spendEvent()]));
    await expect(f.index.ingestPage(CONTRACT, 20)).resolves.toEqual({ status: 'INGESTED', cursor: 'cursor-next', inserted: 1 });
    expect(f.sorobanServer.getEvents).toHaveBeenLastCalledWith(expect.objectContaining({ startLedger: 20 }));
    expect(f.prisma.settlementEventCursor.updateMany).toHaveBeenCalledWith({
      where: { networkId: NETWORK_ID, contractId: CONTRACT, cursor: null }, data: { cursor: 'cursor-next' },
    });
    expect(f.prisma.settlementSpendEvent.createMany).toHaveBeenCalledWith({ data: [f.archive], skipDuplicates: true });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('resumes from the stored cursor and discards a page when another process advanced it', async () => {
    const f = fixture();
    f.prisma.settlementEventCursor.findUnique.mockResolvedValue({ cursor: 'previous' });
    f.prisma.settlementEventCursor.updateMany.mockResolvedValue({ count: 0 });
    f.sorobanServer.getEvents.mockResolvedValue(eventPage());
    f.sorobanServer.getTransaction.mockResolvedValue(successful([spendEvent()]));
    await expect(f.index.ingestPage(CONTRACT, 20)).resolves.toMatchObject({ status: 'CURSOR_CHANGED' });
    expect(f.sorobanServer.getEvents).toHaveBeenCalledWith({ cursor: 'previous', filters: expect.any(Array), limit: expect.any(Number) });
    expect(f.prisma.settlementSpendEvent.createMany).not.toHaveBeenCalled();
  });

  it('keeps the cursor unchanged when a transaction cannot corroborate the event or history was pruned', async () => {
    const f = fixture();
    f.prisma.settlementEventCursor.findUnique.mockResolvedValue({ cursor: 'previous' });
    f.sorobanServer.getEvents.mockResolvedValueOnce(eventPage()).mockRejectedValueOnce(new Error('outside retained history'));
    f.sorobanServer.getTransaction.mockResolvedValue(missing());
    await expect(f.index.ingestPage(CONTRACT)).rejects.toThrow('could not be confirmed');
    await expect(f.index.ingestPage(CONTRACT)).rejects.toThrow('outside retained history');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
});
