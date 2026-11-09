import type { NavigatorScreenParams } from '@react-navigation/native';

import type { DispatchMethod } from '../types/send';

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
  Login: undefined;
  /** `signin` finds an existing account (no OTP) instead of starting sign-up. */
  InputNumber: { mode?: 'signin' } | undefined;
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
  QrScan: undefined;
  /** Send flow: To -> Amount -> Verification -> Method -> Receipt. */
  SendTo: undefined;
  SendAmount: { recipientId: string };
  SendVerification: SendDraft;
  SendMethod: SendDraft;
  /** Needs the reference and time the ledger assigned, so it cannot be opened before a transfer really exists. */
  SendReceipt: SendDraft & { method: DispatchMethod; reference: string; issuedAt: number };
  /** Receive flow: amount -> offline relay voucher QR. */
  ReceiveAmount: undefined;
  ReceiveQr: { amount: number };
  TransactionDetail: { id: string };
  /** Moves funds between the user's own wallets. */
  TransferOnline: undefined;
  TransferOffline: undefined;
};

/** What the Send steps carry forward. Ids and numbers only, so the params stay serializable. */
export type SendDraft = { recipientId: string; amount: number; note: string };
