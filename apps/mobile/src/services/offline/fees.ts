import { LEGACY_PHPC_OFFLINE_FEE_STROOPS, offlineFeeStroops } from '../../../../../packages/pijin_core/src/offline-fee';

const STROOPS_PER_CENT = 100_000n;
const LEGACY_PHPC_FEE_CENTS = Number(LEGACY_PHPC_OFFLINE_FEE_STROOPS / STROOPS_PER_CENT);

export { offlineFeeStroops };

export function feeStroopsToCents(stroops: bigint): number {
  return Number(stroops / STROOPS_PER_CENT);
}

export function quoteOfflineFeeCents(amount: number, tokenSymbol: string): number {
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? feeStroopsToCents(offlineFeeStroops(BigInt(cents) * STROOPS_PER_CENT, tokenSymbol)) : 0;
}

export function savedOfflineFeeCents(feeCents: number | null | undefined, assetCode = 'PHPC'): number {
  if (typeof feeCents === 'number' && Number.isSafeInteger(feeCents) && feeCents >= 0) return feeCents;
  return assetCode === 'PHPC' ? LEGACY_PHPC_FEE_CENTS : 0;
}

/** Vault reads have seven decimal places. Drop fractional cents without rounding up the spendable balance. */
export function spendableCents(pesos: number): number {
  return Math.floor(Math.round(pesos * 10_000_000) / Number(STROOPS_PER_CENT));
}
