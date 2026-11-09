import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { Mascot } from '../components/mascot/Mascot';
import { HiveEntrance } from '../components/transition/HiveEntrance';
import { useHiveEntrance } from '../components/transition/useHiveEntrance';
import { AppBackground } from '../components/ui/AppBackground';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { SignupIncompleteError, completeSignup, fieldErrorText } from '../services/completeSignup';
import { reportError } from '../services/errorReporting';
import { clearSignupSession } from '../services/signupSession';
import { colors, fonts } from '../theme';

// Figma: Account Confirmation (870:2950), 402x874.
const combImage = require('../../assets/landing/comb.png');
const wordmarkImage = require('../../assets/brand/logo-wordmark.png');

export function AccountConfirmationScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AccountConfirmation'>) {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const goHome = useCallback(() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }), [navigation]);
  // "Enter HoneBill" plays the hive entrance (the same one sign-in uses), then Home fades in.
  const { entering, progress, start } = useHiveEntrance(goHome);

  // The heading and button get out of the way first; the scene is covered by the honeycomb, then fades out beneath it.
  const edgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [1, 0], Extrapolation.CLAMP),
  }));
  const sceneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.05, 0.22], [1, 0], Extrapolation.CLAMP),
  }));

  /** Sends the user back to the first sign-up step; what they entered is gone. */
  const startOver = () => {
    clearSignupSession();
    navigation.reset({ index: 0, routes: [{ name: 'InputNumber' }] });
  };

  /**
   * The account is created here, on the last onboarding screen, so only users who got through every step
   * (details, PIN, saving and confirming the phrase) end up registered.
   */
  const enter = async () => {
    if (busy || entering) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const profile = await completeSignup(controller.signal);
      await login(profile);
      clearSignupSession();
      await start();
    } catch (e) {
      if (isAborted(e)) return;
      if (e instanceof SignupIncompleteError) {
        Alert.alert('Session expired', 'Please verify your number again to finish creating your account.', [
          { text: 'OK', onPress: startOver },
        ]);
      } else if (e instanceof ApiError && e.status === 401) {
        // The OTP proof expired (30 minutes) or does not match this number.
        Alert.alert('Verification expired', 'Please verify your phone number again.', [{ text: 'OK', onPress: startOver }]);
      } else if (e instanceof ApiError && e.status === 409) {
        setError('This number already has an account. Go back and sign in.');
      } else if (e instanceof ApiError && e.status === 400) {
        // The server only says "Bad Request" for DTO failures, so point at the likely cause.
        setError(fieldErrorText(e) ?? 'Some of your details were rejected. Please start over and check your name and email.');
      } else if (e instanceof ApiError) {
        setError(errorMessage(e));
      } else {
        reportError(e, { step: 'completeSignup' });
        setError('We could not create your account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />

      <View style={styles.content}>
        <Animated.View style={[styles.titleBlock, edgeStyle]}>
          <GradientTitle size={32}>Vault Secured</GradientTitle>
          <Text style={styles.subtitle}>Your device is now primed for offline zero data transactions.</Text>
        </Animated.View>

        {/* "mascot w bg": honeycomb, Honi, a faded mirrored copy and the wordmark, 400 dp tall. */}
        <Animated.View style={[styles.mascotArea, sceneStyle]} pointerEvents="none">
          <Image source={combImage} style={styles.comb} contentFit="contain" />
          {/* Honi's looping vector animation stops once the transition starts, so it does not compete with it. */}
          <Mascot mood="idlePlain" animated={!entering} style={styles.honi} />
          <Mascot mood="idlePlain" animated={false} style={styles.reflection} />
          <Image source={wordmarkImage} style={styles.wordmark} contentFit="contain" accessibilityLabel="HoneBill" />
        </Animated.View>

        <Animated.View style={[styles.action, edgeStyle]}>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label={busy ? 'Creating your account…' : 'Enter HoneBill'}
            size="large"
            onPress={() => void enter()}
            disabled={busy || entering}
          />
        </Animated.View>
      </View>

      {/* Created only on tap, so this screen carries none of its cost until then. */}
      {entering ? <HiveEntrance progress={progress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40 },
  titleBlock: { gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  mascotArea: { height: 400, width: '100%', alignItems: 'center' },
  comb: { position: 'absolute', top: -17, width: 402, height: 332 },
  honi: { position: 'absolute', top: 87 },
  reflection: { position: 'absolute', top: 324, opacity: 0.5, transform: [{ scaleY: -1 }] },
  wordmark: { position: 'absolute', top: 322, width: 172, height: 56 },
  action: { width: '100%', marginTop: 54, gap: 12 },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral, textAlign: 'center' },
});
