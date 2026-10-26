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
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandler } from './src/services/errorReporting';
import { AccountConfirmationScreen } from './src/screens/AccountConfirmationScreen';
import { InputNumberScreen } from './src/screens/InputNumberScreen';
import { LandingScreen } from './src/screens/LandingScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MpinCreationScreen } from './src/screens/MpinCreationScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { QrScanScreen } from './src/screens/QrScanScreen';
import { UserDetailsScreen } from './src/screens/UserDetailsScreen';
import { MainTabs } from './src/navigation/MainTabs';
import type { RootStackParamList } from './src/navigation/types';
import { fonts } from './src/theme';

installGlobalErrorHandler();
SplashScreen.preventAutoHideAsync().catch(() => {});

// Frontend-only for now: no database, sync, API or Stellar code runs at startup.
const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Landing" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Landing" component={LandingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="InputNumber" component={InputNumberScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="UserDetails" component={UserDetailsScreen} />
        <Stack.Screen name="MpinCreation" component={MpinCreationScreen} />
        <Stack.Screen name="AccountConfirmation" component={AccountConfirmationScreen} />
        <Stack.Screen name="Tabs" component={MainTabs} />
        <Stack.Screen name="QrScan" component={QrScanScreen} />
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

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
