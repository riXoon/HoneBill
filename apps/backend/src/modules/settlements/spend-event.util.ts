import { Address, StrKey, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';

export const SPEND_TOPIC = xdr.ScVal.scvSymbol('spend').toXDR('base64');

export type SpendPayment = {
  nonce: string;
  senderAddress: string;
  receiverAddress: string;
  receiverShortId: string;
  gatewayAddress: string;
  tokenContractId: string;
  amountStroops: string;
  protocolToll: string;
};

export function decodeSpendEvent(topics: xdr.ScVal[], value: xdr.ScVal): SpendPayment | null {
  try {
    if (topics.length !== 3 || topics[0].toXDR('base64') !== SPEND_TOPIC || value.switch().name !== 'scvMap') return null;
    const entries = value.map() ?? [];
    if (entries.some((entry) => entry.key().switch().name !== 'scvSymbol')) return null;
    const fields = new Map(entries.map((entry) => [entry.key().sym().toString(), entry.val()]));
    if (fields.size !== entries.length) return null;

    const senderAddress = readAddress(fields.get('sender'));
    const receiverAddress = readAddress(fields.get('receiver'));
    const gatewayAddress = readAddress(fields.get('gateway'));
    const tokenContractId = readAddress(fields.get('token'));
    const nonce = fields.get('nonce');
    const receiverId = fields.get('receiver_short_id');
    const amount = fields.get('amount');
    const toll = fields.get('protocol_toll');
    if (!senderAddress || senderAddress !== readAddress(topics[1]) || !receiverAddress || !gatewayAddress ||
        !tokenContractId || tokenContractId !== readAddress(topics[2]) || !StrKey.isValidContract(tokenContractId) ||
        nonce?.switch().name !== 'scvBytes' || nonce.bytes().length !== 32 ||
        receiverId?.switch().name !== 'scvBytes' || receiverId.bytes().length !== 6 ||
        amount?.switch().name !== 'scvI128' || toll?.switch().name !== 'scvI128') return null;

    const receiverShortId = receiverId.bytes().toString('latin1');
    const amountStroops = scValToNative(amount) as bigint;
    const protocolToll = scValToNative(toll) as bigint;
    if (!/^[0-9A-Za-z]{6}$/.test(receiverShortId) || amountStroops <= 0n || protocolToll < 0n) return null;
    return {
      nonce: nonce.bytes().toString('base64'), senderAddress, receiverAddress, receiverShortId, gatewayAddress, tokenContractId,
      amountStroops: amountStroops.toString(), protocolToll: protocolToll.toString(),
    };
  } catch {
    return null;
  }
}

export function sameSpend(left: SpendPayment, right: SpendPayment): boolean {
  return left.nonce === right.nonce && left.senderAddress === right.senderAddress &&
    left.receiverAddress === right.receiverAddress && left.receiverShortId === right.receiverShortId &&
    left.gatewayAddress === right.gatewayAddress && left.tokenContractId === right.tokenContractId &&
    left.amountStroops === right.amountStroops && left.protocolToll === right.protocolToll;
}

export function contractSpendEvents(transaction: rpc.Api.GetSuccessfulTransactionResponse, contractId: string): xdr.ContractEventV0[] {
  const events = transaction.events?.contractEventsXdr.flat() ?? [];
  const meta = transaction.resultMetaXdr;
  if (!events.length && meta?.switch() === 3) events.push(...(meta.v3().sorobanMeta()?.events() ?? []));
  if (!events.length && meta?.switch() === 4) events.push(...meta.v4().operations().flatMap((op) => op.events()));

  return events.flatMap((event) => {
    const emitter = event.contractId();
    if (event.type().name !== 'contract' || !Buffer.isBuffer(emitter) || StrKey.encodeContract(emitter) !== contractId || event.body().switch() !== 0) return [];
    const body = event.body().v0();
    return body.topics()[0]?.toXDR('base64') === SPEND_TOPIC ? [body] : [];
  });
}

export function isLedgerNumber(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0xffff_ffff;
}

export function isTransactionHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function readAddress(value: xdr.ScVal | undefined): string | null {
  return value?.switch().name === 'scvAddress' ? Address.fromScVal(value).toString() : null;
}
