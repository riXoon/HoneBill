import type { NavigatorScreenParams } from '@react-navigation/native';

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
};
