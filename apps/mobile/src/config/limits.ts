/** Fixed sizes the backend and the UI agree on. */
export const MPIN_LENGTH = 4;
/** The backend issues 6-character, case-sensitive short IDs. */
export const SHORT_ID_LENGTH = 6;
export const NOTE_MAX = 50;
/**
 * What an offline payment costs on top of its amount: the contract debits `amount + toll` from the vault. The
 * backend sets it per token (`settlements.util.ts`: 5,000,000 stroops for PHPC), and the voucher signature covers
 * it, so a different value here makes the backend reject every voucher.
 */
export const OFFLINE_TOLL_PESOS = 0.5;
export const OFFLINE_TOLL_STROOPS = 5_000_000n;
