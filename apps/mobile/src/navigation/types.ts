import type { NavigatorScreenParams } from '@react-navigation/native';

import type { DispatchMethod, SendMode } from '../types/send';

/** The four tabs behind the bottom navigation bar. */
export type TabParamList = {
  Home: undefined;
  Inbox: undefined;
  History: undefined;
  Profile: undefined;
};

/** v2 route map. Add screens here as they are built. */
export type RootStackParamList = {
  Landing: undefined;
  /** `pinChanged`: arrived right after changing the MPIN, so it asks for the new one instead of offering the fingerprint first. */
  Login: { reason?: 'pinChanged' } | undefined;
  /** `signin` finds an existing account (no OTP) instead of starting sign-up. */
  InputNumber: { mode?: 'signin'; termsAccepted?: boolean } | undefined;
  /** `accept` is the sign-up gate (read to the end, tick, "I Agree"); without it the terms are read-only. */
  Terms: { mode?: 'accept' } | undefined;
  /** `recover` is a sign-in from a phone that does not hold this account's wallet: OTP, then the recovery phrase. */
  Otp: { phone: string; purpose?: 'recover' };
  /** Restores an existing account's wallet on this phone from its 12 words. */
  VerifySeedPhrase: { phone: string };
  UserDetails: undefined;
  MpinCreation: undefined;
  /** One-time backup of the wallet's 12 words, shown right after the account is created. */
  RecoveryPhrase: undefined;
  /** Asks for a few of the phrase's words to confirm the user saved it. */
  RecoveryQuiz: undefined;
  AccountConfirmation: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** `mode` is the wallet the payment will spend (set when opened from Send); without it the scan screen starts from the connection. */
  QrScan: { mode?: SendMode } | undefined;
  /** Send flow: To -> Amount -> Verification -> Method -> Receipt. */
  SendTo: { mode?: SendMode } | undefined;
  /** `amount` pre-fills the field when a scanned payment-request QR carried one. */
  SendAmount: { recipientId: string; mode?: SendMode; amount?: number };
  SendVerification: SendDraft;
  SendMethod: SendDraft;
  /**
   * Needs the reference and time the ledger assigned, so it cannot be opened before a transfer really exists.
   * `online` is a transfer already settled on the ledger; `sms` and `relay` are offline vouchers still to dispatch.
   */
  SendReceipt: SendDraft & { method: DispatchMethod | 'online'; reference: string; issuedAt: number };
  /** Receive flow: My QR (Short ID only) -> optionally enter an amount -> My QR with that amount. */
  ReceiveAmount: undefined;
  /** No `amount` = a QR with only the short ID, which fills the ID in for the sender. */
  ReceiveQr: { amount?: number } | undefined;
  /** Profile menu: edit name and email (confirmed with the MPIN). */
  AccountSettings: undefined;
  /** Profile menu: vault address, recovery phrase and offline payment setup. */
  VaultSettings: undefined;
  /** Profile menu: current MPIN, then a new one twice. */
  ChangeMpin: undefined;
  TransactionDetail: { id: string };
  /** Adds PHPC to the online wallet through the anchor's deposit. */
  TopUp: undefined;
  /** Moves funds between the user's own wallets. */
  TransferOnline: undefined;
  TransferOffline: undefined;
};

/** What the Send steps carry forward. Ids and numbers only, so the params stay serializable. */
export type SendDraft = { recipientId: string; amount: number; note: string; mode?: SendMode };
