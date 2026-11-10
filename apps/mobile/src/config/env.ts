/**
 * Public runtime config. Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time, so each
 * variable must be read by its literal name (no destructuring or dynamic keys).
 */
const rawBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();

/** Backend origin without a trailing slash or `/api[/v2]` (the client adds `/api/v2`). */
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '').replace(/\/api(\/v2)?$/i, '');

/** Soroban RPC the app submits its own signed transactions to. */
export const SOROBAN_RPC_URL = (process.env.EXPO_PUBLIC_SOROBAN_RPC_URL ?? '').trim().replace(/\/+$/, '');

/** Must match the backend's network, or every signature it prepares is for the wrong chain. */
export const STELLAR_NETWORK_PASSPHRASE = (process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? '').trim();

/** The PHPC token contract ("C..."). The backend rejects any token it does not have as active. */
export const TOKEN_CONTRACT_ID = (process.env.EXPO_PUBLIC_TOKEN_ID ?? '').trim();

/** Horizon, which the app reads its own account from and submits its classic (non-contract) transactions to. */
export const HORIZON_URL = (process.env.EXPO_PUBLIC_HORIZON_URL ?? '').trim().replace(/\/+$/, '');

/** Who issues PHPC. A wallet needs a trustline to this issuer before it can hold the token. */
export const PHPC_ISSUER = (process.env.EXPO_PUBLIC_PHPC_ISSUER_PUBKEY ?? '').trim();

/** The number a voucher is texted to. The backend's SMS gateway receives it and settles it on the ledger. */
export const SMS_GATEWAY_NUMBER = (process.env.EXPO_PUBLIC_SMS_GATEWAY_NUMBER ?? '').trim();
