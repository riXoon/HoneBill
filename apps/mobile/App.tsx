import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Per-weight imports: the package index would bundle all 9 weights (~700 KB of TTF).
import { Lexend_200ExtraLight } from '@expo-google-fonts/lexend/200ExtraLight';
import { Lexend_300Light } from '@expo-google-fonts/lexend/300Light';
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { Lexend_700Bold } from '@expo-google-fonts/lexend/700Bold';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider } from './src/context/AuthContext';
import { WalletDataProvider } from './src/context/WalletDataContext';
import { ConnectionRestoredNotice } from './src/components/ConnectionRestoredNotice';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandler } from './src/services/errorReporting';
import { syncService } from './src/services/sync/syncService';
import { AccountSettingsScreen } from './src/screens/AccountSettingsScreen';
import { ChangeMpinScreen } from './src/screens/ChangeMpinScreen';
import { FeedbackScreen } from './src/screens/FeedbackScreen';
import { VaultSettingsScreen } from './src/screens/VaultSettingsScreen';
import { AccountConfirmationScreen } from './src/screens/AccountConfirmationScreen';
import { InputNumberScreen } from './src/screens/InputNumberScreen';
import { LandingScreen } from './src/screens/LandingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MpinCreationScreen } from './src/screens/MpinCreationScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { QrScanScreen } from './src/screens/QrScanScreen';
import { RecoveryPhraseScreen } from './src/screens/RecoveryPhraseScreen';
import { RecoveryQuizScreen } from './src/screens/RecoveryQuizScreen';
import { ReceiveQrScreen } from './src/screens/ReceiveQrScreen';
import { ReceiveScreen } from './src/screens/ReceiveScreen';
import { TransactionDetailScreen } from './src/screens/TransactionDetailScreen';
import { SendAmountScreen } from './src/screens/SendAmountScreen';
import { SendMethodScreen } from './src/screens/SendMethodScreen';
import { SendReceiptScreen } from './src/screens/SendReceiptScreen';
import { SendToScreen } from './src/screens/SendToScreen';
import { SendVerificationScreen } from './src/screens/SendVerificationScreen';
import { TermsScreen } from './src/screens/TermsScreen';
import { TopUpScreen } from './src/screens/TopUpScreen';
import { TransferToOfflineScreen } from './src/screens/TransferToOfflineScreen';
import { TransferToOnlineScreen } from './src/screens/TransferToOnlineScreen';
import { UserDetailsScreen } from './src/screens/UserDetailsScreen';
import { VerifySeedPhraseScreen } from './src/screens/VerifySeedPhraseScreen';
import { MainTabs } from './src/navigation/MainTabs';
import type { RootStackParamList } from './src/navigation/types';
import { fonts } from './src/theme';

installGlobalErrorHandler();
SplashScreen.preventAutoHideAsync().catch(() => {});

// No database, sync or Stellar code runs at startup; data is fetched per account after sign-in.
const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Landing" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Landing" component={LandingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="InputNumber" component={InputNumberScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="VerifySeedPhrase" component={VerifySeedPhraseScreen} />
        <Stack.Screen name="UserDetails" component={UserDetailsScreen} />
        <Stack.Screen name="MpinCreation" component={MpinCreationScreen} />
        <Stack.Screen name="RecoveryPhrase" component={RecoveryPhraseScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="RecoveryQuiz" component={RecoveryQuizScreen} />
        <Stack.Screen name="AccountConfirmation" component={AccountConfirmationScreen} />
        {/* Fades in (instead of the default slide) so entering the app continues the "Enter HoneBill" light. */}
        <Stack.Screen name="Tabs" component={MainTabs} options={{ animation: 'fade' }} />
        <Stack.Screen name="QrScan" component={QrScanScreen} />
        <Stack.Screen name="SendTo" component={SendToScreen} />
        <Stack.Screen name="SendAmount" component={SendAmountScreen} />
        <Stack.Screen name="SendVerification" component={SendVerificationScreen} />
        <Stack.Screen name="SendMethod" component={SendMethodScreen} />
        <Stack.Screen name="ReceiveAmount" component={ReceiveScreen} />
        <Stack.Screen name="ReceiveQr" component={ReceiveQrScreen} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
        <Stack.Screen name="VaultSettings" component={VaultSettingsScreen} />
        <Stack.Screen name="ChangeMpin" component={ChangeMpinScreen} />
        <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
        <Stack.Screen name="Feedback" component={FeedbackScreen} />
        <Stack.Screen name="TopUp" component={TopUpScreen} />
        <Stack.Screen name="TransferOnline" component={TransferToOnlineScreen} />
        <Stack.Screen name="TransferOffline" component={TransferToOfflineScreen} />
        {/* The receipt ends the flow: no swipe-back into the finished steps (its own Back goes home). */}
        <Stack.Screen name="SendReceipt" component={SendReceiptScreen} options={{ gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.extraLight]: Lexend_200ExtraLight,
    [fonts.light]: Lexend_300Light,
    [fonts.regular]: Lexend_400Regular,
    [fonts.medium]: Lexend_500Medium,
    [fonts.semibold]: Lexend_600SemiBold,
    [fonts.bold]: Lexend_700Bold,
  });
  const ready = fontsLoaded || fontError != null;

  // Syncs on reconnect, return to the foreground, an interval and pull-to-refresh, for the app's lifetime.
  useEffect(() => syncService.start(), []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <WalletDataProvider>
              <RootNavigator />
              <ConnectionRestoredNotice />
            </WalletDataProvider>
            <StatusBar style="dark" />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
