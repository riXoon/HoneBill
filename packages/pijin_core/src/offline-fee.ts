export const LEGACY_PHPC_OFFLINE_FEE_STROOPS = 5_000_000n;

/** Fee in stroops for one offline payment, with inclusive upper bounds. */
export function offlineFeeStroops(amountStroops: bigint, tokenSymbol: string): bigint {
  if (tokenSymbol !== 'PHPC' || amountStroops <= 0n) return 0n;
  if (amountStroops <= 1_000_000_000n) return LEGACY_PHPC_OFFLINE_FEE_STROOPS;
  if (amountStroops <= 5_000_000_000n) return 15_000_000n;
  if (amountStroops <= 10_000_000_000n) return 30_000_000n;
  if (amountStroops <= 50_000_000_000n) return 75_000_000n;
  return 150_000_000n;
}
