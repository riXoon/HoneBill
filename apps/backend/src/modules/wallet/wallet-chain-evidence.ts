import { Address, FeeBumpTransaction, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { isLedgerNumber, isTransactionHash } from '../settlements/spend-event.util.js';

type Effect =
  | { kind: 'transfer'; sender: string; recipient: string }
  | { kind: 'move'; sender: string; direction: 'TO_OFFLINE' | 'TO_ONLINE' };

export type WalletEffect = Effect & {
  token: string;
  amount: bigint;
  txHash: string;
  ledger: number;
  confirmedAt: Date;
};

const MAX_DATABASE_AMOUNT = (1n << 63n) - 1n;

export const walletEventTopics = {
  deposit: nativeToScVal('deposit', { type: 'symbol' }).toXDR('base64'),
  withdraw: nativeToScVal('withdraw', { type: 'symbol' }).toXDR('base64'),
  transfer: nativeToScVal('transfer', { type: 'symbol' }).toXDR('base64'),
};

export function matchesWalletEnvelope(
  transaction: rpc.Api.GetSuccessfulTransactionResponse | rpc.Api.GetFailedTransactionResponse,
  hash: string,
  passphrase: string,
): boolean {
  return readWalletEnvelope(transaction, hash, passphrase) !== null;
}

function readWalletEnvelope(
  transaction: rpc.Api.GetSuccessfulTransactionResponse | rpc.Api.GetFailedTransactionResponse,
  hash: string,
  passphrase: string,
) {
  if (transaction.txHash !== hash || !isTransactionHash(hash) || !isLedgerNumber(transaction.ledger)) return null;
  try {
    const envelope = TransactionBuilder.fromXDR(transaction.envelopeXdr, passphrase);
    return envelope.hash().toString('hex') === hash ? envelope : null;
  } catch {
    return null;
  }
}

export function verifiedWalletEffect(
  transaction: rpc.Api.GetSuccessfulTransactionResponse,
  hash: string,
  passphrase: string,
  vault: string,
): WalletEffect | null {
  if (transaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) return null;
  const envelope = readWalletEnvelope(transaction, hash, passphrase);
  if (!envelope) return null;
  const closedAt = Number(transaction.createdAt);
  const confirmedAt = new Date(closedAt * 1000);
  if (!Number.isSafeInteger(closedAt) || closedAt <= 0 || !Number.isFinite(confirmedAt.getTime())) return null;
  const tx = envelope instanceof FeeBumpTransaction ? envelope.innerTransaction : envelope;
  const [operation] = tx.operations;
  if (tx.operations.length !== 1 || operation?.type !== 'invokeHostFunction' ||
      operation.func.switch().name !== 'hostFunctionTypeInvokeContract') return null;
  const call = operation.func.invokeContract();
  const contract = Address.fromScAddress(call.contractAddress()).toString();
  const name = call.functionName().toString();
  const args = call.args();
  const sender = address(args[0]);
  if (!sender || !StrKey.isValidEd25519PublicKey(sender)) return null;
  const common = { txHash: hash, ledger: transaction.ledger, confirmedAt };

  if (contract === vault && (name === 'deposit' || name === 'withdraw')) {
    const depositing = name === 'deposit';
    const token = address(args[1]);
    const amount = positiveAmount(args[depositing ? 3 : 2]);
    if (args.length !== (depositing ? 4 : 3) || !token || !StrKey.isValidContract(token) || amount === null) return null;
    const vaultEvent = walletEvents(transaction, vault, [name, sender, token]);
    if (vaultEvent.length !== 1 ||
        address(field(vaultEvent[0].data(), 'sender')) !== sender ||
        address(field(vaultEvent[0].data(), 'token')) !== token ||
        positiveAmount(field(vaultEvent[0].data(), 'amount')) !== amount ||
        !hasTransfer(transaction, token, depositing ? sender : vault, depositing ? vault : sender, amount)) return null;
    return { ...common, kind: 'move', token, amount, sender, direction: depositing ? 'TO_OFFLINE' : 'TO_ONLINE' };
  }
  if (contract === vault || name !== 'transfer' || args.length !== 3) return null;
  const recipient = address(args[1]);
  const amount = positiveAmount(args[2]);
  if (!recipient || recipient === sender || !StrKey.isValidEd25519PublicKey(recipient) || amount === null ||
      !hasTransfer(transaction, contract, sender, recipient, amount)) return null;
  return { ...common, kind: 'transfer', token: contract, amount, sender, recipient };
}

function walletEvents(transaction: rpc.Api.GetSuccessfulTransactionResponse, contract: string, expected: string[]) {
  let events = transaction.events?.contractEventsXdr.flat() ?? [];
  const meta = transaction.resultMetaXdr;
  if (!events.length && meta?.switch() === 3) events = meta.v3().sorobanMeta()?.events() ?? [];
  if (!events.length && meta?.switch() === 4) events = meta.v4().operations().flatMap((op) => op.events());
  return events.flatMap((event) => {
    const emitter = event.contractId();
    if (event.type().name !== 'contract' || !Buffer.isBuffer(emitter) ||
        StrKey.encodeContract(emitter) !== contract || event.body().switch() !== 0) return [];
    const body = event.body().v0();
    const topics = body.topics();
    const [symbol, ...addresses] = expected;
    if (topics[0]?.switch().name !== 'scvSymbol' || topics[0].sym().toString() !== symbol ||
        topics.length < expected.length || !addresses.every((value, index) => address(topics[index + 1]) === value)) return [];
    return [body];
  });
}

function hasTransfer(transaction: rpc.Api.GetSuccessfulTransactionResponse, token: string, from: string, to: string, amount: bigint) {
  const events = walletEvents(transaction, token, ['transfer', from, to]);
  return events.length === 1 && (positiveAmount(events[0].data()) ?? positiveAmount(field(events[0].data(), 'amount'))) === amount;
}

function address(value: xdr.ScVal | undefined) {
  return value?.switch().name === 'scvAddress' ? Address.fromScVal(value).toString() : null;
}

function field(value: xdr.ScVal, name: string) {
  if (value.switch().name !== 'scvMap') return undefined;
  return value.map()?.find((entry) =>
    entry.key().switch().name === 'scvSymbol' && entry.key().sym().toString() === name)?.val();
}

function positiveAmount(value: xdr.ScVal | undefined) {
  if (value?.switch().name !== 'scvI128') return null;
  const amount = scValToNative(value) as bigint;
  return amount > 0n && amount <= MAX_DATABASE_AMOUNT ? amount : null;
}
