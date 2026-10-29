import type { NavigatorScreenParams } from '@react-navigation/native';

import type { DispatchMethod } from '../mocks/send';

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
  InputNumber: undefined;
  Otp: { phone: string };
  UserDetails: undefined;
  MpinCreation: undefined;
  AccountConfirmation: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  QrScan: undefined;
  /** Send flow: To -> Amount -> Verification -> Method -> Receipt. */
  SendTo: undefined;
  SendAmount: { recipientId: string };
  SendVerification: SendDraft;
  SendMethod: SendDraft;
  SendReceipt: SendDraft & { method: DispatchMethod };
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
