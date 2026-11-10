/**
 * Which funds a payment spends, chosen by the Online/Offline view it was started from. They are two separate
 * processes: `online` is signed and settled on the ledger now; `offline` is a voucher from the vault that is texted to
 * the gateway (or relayed) later, and works with or without a connection.
 */
export type SendMode = 'online' | 'offline';

/** How a signed offline transfer leaves the phone (Send 4). */
export type DispatchMethod = 'sms' | 'relay';
