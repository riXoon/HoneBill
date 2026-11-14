import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatPhoneDisplay } from '../../services/accountPhone';
import { ApiError, errorMessage, isAborted } from '../../services/api/client';
import { sendOtp, verifyOtp } from '../../services/api/otp';
import { colors, fonts, radius } from '../../theme';
import { Button } from './Button';
import { CodeBoxes } from './CodeBoxes';

/** The backend sends 6-digit codes. */
const CODE_LENGTH = 6;
/** Matches the signup OTP screen; close to the server's per-phone send limit. */
const RESEND_SECONDS = 30;

function verifyErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401 && error.attemptsRemaining !== undefined) {
    const left = error.attemptsRemaining;
    return `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
  }
  return errorMessage(error);
}

type SmsCodeStepProps = {
  /** The account's number, which the code is texted to. */
  phone: string;
  /**
   * Called once the code checks out, with the proof the server takes for the change. `undefined` only on a
   * development server that issues no proof (it then does not ask for one either).
   */
  onVerified: (verificationToken: string | undefined) => void;
};

/**
 * Proves the person holds the account's phone before a sensitive change (MPIN, email): texts a code when it opens,
 * checks it as soon as all six digits are in, and offers Resend after 30 seconds. Same behavior as the signup OTP
 * screen, sized to sit inside a settings page.
 */
export function SmsCodeStep({ phone, onVerified }: SmsCodeStepProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const request = useRef<AbortController | null>(null);
  const done = useRef(false);

  const send = useCallback(async () => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSending(true);
    setError(null);
    try {
      await sendOtp(phone, controller.signal);
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      if (!isAborted(e)) {
        setError(errorMessage(e));
        // A failed send can be retried straight away.
        setCooldown(0);
      }
    } finally {
      if (request.current === controller) setSending(false);
    }
  }, [phone]);

  // The code goes out as soon as the step opens.
  useEffect(() => {
    void send();
    return () => request.current?.abort();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (value: string) => {
    if (busy || done.current) return;
    if (value.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code.`);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, value, controller.signal);
      done.current = true;
      onVerified(result.verificationToken);
    } catch (e) {
      if (isAborted(e)) return;
      setCode('');
      setError(verifyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onChange = (value: string) => {
    setCode(value);
    // The code usually arrives by autofill all at once: check it as soon as it is complete.
    if (value.length === CODE_LENGTH) void verify(value);
  };

  const canResend = !busy && !sending && cooldown <= 0;

  return (
    <View style={styles.block}>
      <Text style={styles.subtitle}>
        {sending ? 'Sending a code to ' : 'We texted a 6-digit code to '}
        <Text style={styles.phone}>{formatPhoneDisplay(phone)}</Text>.
      </Text>
      <CodeBoxes length={CODE_LENGTH} value={code} onChange={onChange} autoFocus accessibilityLabel="SMS verification code" />
      <Text
        style={[styles.status, error ? styles.error : null]}
        accessibilityRole={error ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
      >
        {busy ? 'Checking…' : (error ?? ' ')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canResend }}
        disabled={!canResend}
        onPress={() => void send()}
        hitSlop={8}
        style={({ pressed }) => [styles.resend, canResend && styles.resendActive, pressed && canResend && styles.pressed]}
      >
        {canResend ? (
          <Text style={styles.resendHint}>
            Didn't get it? <Text style={styles.resendAction}>Resend</Text>
          </Text>
        ) : (
          <Text style={styles.resendWaiting}>{sending ? 'Sending…' : `Resend code in ${cooldown}s`}</Text>
        )}
      </Pressable>
      <Button label={busy ? 'Please wait…' : 'Verify'} size="large" onPress={() => void verify(code)} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 14, alignItems: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center' },
  phone: { fontFamily: fonts.semibold },
  status: { minHeight: 18, fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.coral },
  resend: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  resendActive: { backgroundColor: colors.yellow, borderColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  resendWaiting: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  resendHint: { fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlign: 'center' },
  resendAction: { fontFamily: fonts.bold, fontSize: 16, color: colors.borderRed, textDecorationLine: 'underline' },
});
