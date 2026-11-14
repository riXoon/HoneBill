import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { AuthScroll } from '../components/ui/AuthScroll';
import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { GradientTitle } from '../components/ui/GradientTitle';
import { WeakPinDialog } from '../components/ui/WeakPinDialog';
import { MPIN_LENGTH } from '../config/limits';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { weakMpinReason, type WeakMpinReason } from '../services/mpinPolicy';
import { clearSignupSession, getSignupSession, setSignupSecurity } from '../services/signupSession';
import { createDeviceWallet, type NewWallet } from '../services/wallet/deviceWallet';
import { colors, fonts } from '../theme';
import { useScale } from '../theme/responsive';
import { afterNextPaint } from '../utils/async';

// Figma: MPIN Creation (870:2965), 402x874.

/** Padlock from the Figma icon sprite (small icons, 870:2983); sprite icons are centred on (11.86, 144.83). */
function LockIcon() {
  return (
    <Svg width={24} height={24} viewBox="-0.14 132.83 24 24">
      <Path
        d="M6.91709 143.847V139.903C6.91709 138.595 7.43761 137.341 8.36413 136.416C9.29064 135.492 10.5473 134.972 11.8576 134.972C13.1679 134.972 14.4245 135.492 15.351 136.416C16.2775 137.341 16.798 138.595 16.798 139.903V143.847M4.9409 143.847H18.7742C19.8657 143.847 20.7504 144.73 20.7504 145.819V152.722C20.7504 153.811 19.8657 154.694 18.7742 154.694H4.9409C3.84948 154.694 2.96471 153.811 2.96471 152.722V145.819C2.96471 144.73 3.84948 143.847 4.9409 143.847Z"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function MpinCreationScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'MpinCreation'>) {
  const scale = useScale();
  const [pin, setPin] = useState('');
  const [weak, setWeak] = useState<WeakMpinReason | null>(null);
  // Remounting the boxes after the dialog brings the keyboard back (the Modal steals focus).
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Created once per visit, so a retry after a failure keeps the same keys. */
  const wallet = useRef<NewWallet | null>(null);

  const startOver = () => {
    clearSignupSession();
    navigation.popTo('InputNumber');
  };

  /**
   * Creates the wallet on this device and remembers the PIN, but does NOT register with the server: the
   * account is created on the last onboarding screen, so quitting before then leaves nothing behind.
   */
  const confirm = async () => {
    if (busy || pin.length !== MPIN_LENGTH) return;
    const reason = weakMpinReason(pin);
    if (reason) {
      setWeak(reason);
      return;
    }

    const session = getSignupSession();
    if (!session?.details) {
      Alert.alert('Session expired', 'Please verify your number again to continue.', [{ text: 'OK', onPress: startOver }]);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Show "Creating your vault…" before the key maths starts, so a tap is acknowledged at once.
      await afterNextPaint();
      // The phrase is saved to the keystore here, before it is shown for backup.
      if (!wallet.current) wallet.current = await createDeviceWallet();
      setSignupSecurity(pin, wallet.current);
      // Reset: the PIN and wallet are fixed from here on; the phrase is the next step.
      navigation.reset({ index: 0, routes: [{ name: 'RecoveryPhrase' }] });
    } catch (e) {
      // Keystore or randomness failure while creating the wallet.
      reportError(e, { step: 'createWallet' });
      setPin('');
      setAttempt((n) => n + 1);
      setError('We could not create your secure wallet on this device. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const dismissWeak = () => {
    setWeak(null);
    setPin('');
    setAttempt((n) => n + 1);
  };

  return (
    <View style={styles.root}>
      <AppBackground />

      <AuthScroll style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle>Secure Your Account</GradientTitle>
          <Text style={styles.subtitle}>Create a 4-digit PIN to protect your device</Text>
        </View>

        <View style={styles.codeBlock}>
          <CodeBoxes key={attempt} length={MPIN_LENGTH} value={pin} onChange={setPin} secure autoFocus accessibilityLabel="New 4-digit PIN" />
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <Button
          label={busy ? 'Creating your vault…' : 'Confirm 4-digit pin'}
          size="large"
          icon={busy ? undefined : <LockIcon />}
          onPress={() => void confirm()}
          disabled={busy}
        />

        {/* Honi's image (shield and lock included) is taller than the 196 dp component; it hangs from the top. */}
        <View style={[styles.mascotSlot, { height: 300 * scale }]}>
          <Mascot mood="secure" />
        </View>
      </AuthScroll>
      {/* After the scroll area, so the back button is drawn (and tapped) on top of it. */}
      <AuthChrome step={4} onBack={navigation.goBack} />

      <WeakPinDialog reason={weak} onDismiss={dismissWeak} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 40, gap: 40 },
  titleBlock: { gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 15, color: colors.textMuted },
  codeBlock: { gap: 12, alignItems: 'center' },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral, textAlign: 'center' },
  mascotSlot: { alignItems: 'center' },
});
