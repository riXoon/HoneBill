import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { sendOtp, verifyOtp } from '../services/api/otp';
import { setSignupSession } from '../services/signupSession';
import { colors, fonts, radius } from '../theme';

// Figma: OTP (870:2988), 402x874. The backend sends 6-digit codes (the design drew 4 boxes).
const OTP_LENGTH = 6;
/** Matches the server's per-phone send limit (3 per 5 minutes) closely enough to stop accidental spam. */
const RESEND_SECONDS = 30;

function verifyErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401 && error.attemptsRemaining !== undefined) {
    const left = error.attemptsRemaining;
    return `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
  }
  return errorMessage(error);
}

export function OtpScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Otp'>) {
  const { phone } = route.params;
  const recover = route.params.purpose === 'recover';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  /** True while a new code is being requested, so the Resend link can say so. */
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async () => {
    if (busy) return;
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, code, controller.signal);
      if (recover) {
        navigation.navigate('VerifySeedPhrase', { phone });
      } else {
        setSignupSession({ phone, verificationToken: result.verificationToken });
        navigation.navigate('UserDetails');
      }
    } catch (e) {
      if (isAborted(e)) return;
      setCode('');
      setError(verifyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // The code usually arrives by autofill all at once: check it as soon as it is complete instead of waiting for a tap.
  useEffect(() => {
    if (code.length === OTP_LENGTH && !busy) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    if (busy || cooldown > 0) return;

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setResending(true);
    setError(null);
    try {
      await sendOtp(phone, controller.signal);
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      if (!isAborted(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
      setResending(false);
    }
  };

  const canResend = !busy && cooldown <= 0;

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={recover ? undefined : 2} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.header}>
          <GradientTitle>Verify OTP</GradientTitle>
          <Text style={styles.subtitle}>
            We sent a verification code to your mobile number: {formatPhoneDisplay(phone)}
          </Text>
        </View>

        <View style={styles.codeBlock}>
          <CodeBoxes length={OTP_LENGTH} value={code} onChange={setCode} autoFocus accessibilityLabel="One-time code" />
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.mascotSlot}>
          <Mascot mood="success" />
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || cooldown > 0 }}
            disabled={busy || cooldown > 0}
            onPress={() => void resend()}
            hitSlop={8}
            style={({ pressed }) => [styles.resendPill, canResend && styles.resendPillActive, pressed && canResend && styles.resendPillPressed]}
          >
            {canResend ? (
              <Text style={styles.resendHint}>
                Didn't get an OTP? <Text style={styles.resendAction}>Resend</Text>
              </Text>
            ) : (
              <Text style={styles.resendWaiting}>
                {resending ? 'Sending a new code…' : `Resend code in ${cooldown}s`}
              </Text>
            )}
          </Pressable>
          <Button label={busy ? 'Please wait…' : 'Verify'} size="large" onPress={() => void verify()} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40, gap: 40 },
  header: { gap: 11 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  codeBlock: { gap: 12, alignItems: 'center' },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral, textAlign: 'center' },
  mascotSlot: { height: 196, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: 16, alignItems: 'center' },
  resendPill: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  // Ready to tap: tinted pill with a visible border so it reads as an action, not a caption.
  resendPillActive: { backgroundColor: colors.yellow, borderColor: colors.primarySoft },
  resendPillPressed: { opacity: 0.7 },
  resendWaiting: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  resendHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.text, textAlign: 'center' },
  // borderRed (not primary) for the link text: orange on this background is too low-contrast to read comfortably.
  resendAction: { fontFamily: fonts.bold, fontSize: 14, color: colors.borderRed, textDecorationLine: 'underline' },
});
