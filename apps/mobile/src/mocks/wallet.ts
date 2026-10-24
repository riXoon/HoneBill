/** Mock wallet data for Receive and the wallet-to-wallet transfers (Figma Receive 1/2, Transfer to Online/Offline) until the real account and ledger services are wired in. */

/** Receive 1: the account the money is credited to (sample values from the design). */
export const mockReceiver = {
  name: 'Juan Dela Cruz',
  shortId: 'TIBSF3',
  walletAddress: 'GAKQ5RBFR4DC124K0L6JDW',
} as const;

/** Transfer to Online / Offline: the two wallets' balances as the design prints them. */
export const ONLINE_WALLET_BALANCE = 100_000;
export const OFFLINE_WALLET_BALANCE = 10_000;

export type WalletKind = 'online' | 'offline';
