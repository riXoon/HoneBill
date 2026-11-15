import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppBackground } from '../components/ui/AppBackground';
import { Keypad, keypadRowHeight } from '../components/ui/Keypad';
import { HiveEntrance } from '../components/transition/HiveEntrance';
import { useHiveEntrance } from '../components/transition/useHiveEntrance';
import { PinDots } from '../components/ui/PinDots';
import { ProcessingOverlay } from '../components/ui/ProcessingOverlay';
import { Mascot } from '../components/mascot/Mascot';
import { MPIN_LENGTH } from '../config/limits';
import { useAuth, type AccountProfile } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay, getAccountPhone } from '../services/accountPhone';
import { clearStoredAccount, getStoredAccount } from '../services/accountStorage';
import { verifyPin } from '../services/api/auth';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { sendOtp } from '../services/api/otp';
import { lookupUserByPhone } from '../services/api/users';
import { authenticateWithBiometrics, isBiometricAvailable } from '../services/biometrics';
import { getConnectivity } from '../services/connectivity';
import { checkMpinOffline, forgetMpin, rememberMpin, type OfflineMpinResult } from '../services/offlineMpin';
import { getDevicePublicKey } from '../services/wallet/deviceWallet';
import { colors, fonts, radius } from '../theme';
import { afterNextPaint } from '../utils/async';

// Figma: Login Page (870:3055), 402x874.
/** Sign-in is something people do often, so its hive entrance runs a little shorter than the one after sign-up. */
const SIGN_IN_HIVE_MS = 900;
/** Logo (30 + 17), then the number pill, prompt, PIN dots and the "Forgot MPIN?" link (about 224 dp): what sits above and below Honi. */
const LOGIN_FIXED_BLOCKS = 47 + 190 + 34;
const logoHorizontal = require('../../assets/brand/logo-horizontal.png');

/** Swap arrows from the Figma icon sprite (870:3065), cropped to the visible glyph. */
function SwapIcon() {
  return (
    <Svg width={17} height={16} viewBox="3.5 136.8 16.7 16">
      <Path
        d="M19.7814 143.216C19.8571 143.034 19.8769 142.833 19.8383 142.639C19.7997 142.445 19.7043 142.266 19.5644 142.126L14.5644 137.126L13.1504 138.54L16.4434 141.833H3.85742V143.833H18.8574C19.0552 143.834 19.2485 143.775 19.413 143.665C19.5775 143.555 19.7057 143.399 19.7814 143.216ZM3.93342 146.45C3.85771 146.633 3.83792 146.834 3.87655 147.028C3.91517 147.222 4.01048 147.401 4.15042 147.54L9.15042 152.54L10.5644 151.126L7.27142 147.833H19.8574V145.833H4.85742C4.65965 145.833 4.46631 145.892 4.30184 146.002C4.13737 146.112 4.00916 146.268 3.93342 146.45Z"
        fill={colors.pink}
      />
    </Svg>
  );
}

/** Whether this phone's keystore holds the wallet whose address is `publicKey`. */
async function holdsWalletFor(publicKey: string): Promise<boolean> {
  try {
    return (await getDevicePublicKey()) === publicKey;
  } catch {
    return false;
  }
}

/** The server could not be reached (no signal, or the request timed out), as opposed to it answering "no". */
function isNoConnection(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');
}

function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function offlinePinMessage(result: Exclude<OfflineMpinResult, { ok: true }>, canUseFingerprint: boolean): string {
  switch (result.reason) {
    case 'wrong':
      return `Incorrect MPIN. ${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? 'try' : 'tries'} left.`;
    case 'locked':
      return `Too many incorrect tries. Try again in ${minutesText(result.retryAfterSeconds)}.`;
    // Nothing saved yet: the MPIN works offline only after the server has accepted it once on this phone.
    case 'unavailable':
      return canUseFingerprint
        ? "You're offline. To use your MPIN offline, sign in with it once while online. For now, use your fingerprint."
        : "You're offline. To use your MPIN offline, sign in with it once while online.";
  }
}

function pinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && error.attemptsRemaining !== undefined) {
      const left = error.attemptsRemaining;
      return `Incorrect MPIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
    }
    if (error.status === 423) return `Too many incorrect tries. Try again in ${minutesText(error.retryAfter ?? 900)}.`;
    if (error.status === 404) return 'No MPIN is set for this number. Tap the number to use another.';
  }
  return errorMessage(error);
}

export function LoginScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  // Right after an MPIN change, the person signs in with the new MPIN: no automatic fingerprint prompt (the keypad
  // still offers it), and the prompt says why they are here.
  const pinChanged = route.params?.reason === 'pinChanged';
  const locked = route.params?.reason === 'locked';
  const insets = useSafeAreaInsets();
  // The keypad (shorter rows on a shorter phone) and the fixed blocks above it come first; Honi takes what is left,
  // between 90 and 200 dp, so the PIN dots never end up on the keys.
  const { height: windowHeight } = useWindowDimensions();
  const topPad = Math.max(24, insets.top) + 60;
  const keypadHeight = 4 * keypadRowHeight(windowHeight) + Math.max(24, insets.bottom);
  const mascotSlot = Math.max(90, Math.min(200, windowHeight - keypadHeight - topPad - LOGIN_FIXED_BLOCKS));
  const { login } = useAuth();
  const [pin, setPin] = useState('');
  /** undefined while the saved number loads, null when this phone has none yet. */
  const [phone, setPhone] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** What the sign-in loading screen says is happening. */
  const [signInStep, setSignInStep] = useState('Checking your MPIN…');
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const [biometricSupported, setBiometricSupported] = useState(false);
  /** The profile left by the last sign-in, which a fingerprint may reopen. */
  const [stored, setStored] = useState<AccountProfile | null>(null);
  const prompted = useRef(pinChanged);

  useEffect(() => () => request.current?.abort(), []);

  // Re-read on focus: coming back from "use another number" has just saved a new one.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([getAccountPhone(), getStoredAccount()]).then(([saved, account]) => {
        if (active) {
          setPhone(saved);
          setStored(account);
          setPin('');
          setError(null);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const changeNumber = useCallback(() => navigation.navigate('InputNumber', { mode: 'signin' }), [navigation]);

  const goHome = useCallback(() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }), [navigation]);
  // Success (MPIN or fingerprint) plays the honeycomb entrance, then goes to Home. Home's data has been loading since
  // the account was set, so it is usually ready by the time the animation ends.
  const { entering, progress, start: enterHive } = useHiveEntrance(goHome, SIGN_IN_HIVE_MS);

  /** Proves the number by OTP, then the recovery-phrase screen puts the wallet on this phone. */
  const startRecovery = useCallback(
    async (recoverPhone: string, signal: AbortSignal) => {
      await Promise.all([clearStoredAccount(), forgetMpin()]);
      setStored(null);
      await sendOtp(recoverPhone, signal);
      navigation.navigate('Otp', { phone: recoverPhone, purpose: 'recover' });
    },
    [navigation],
  );

  /**
   * No connection: the MPIN is checked against the hash saved at the last online sign-in, and the saved profile is
   * opened, exactly as the fingerprint does. Returns the message to show when it cannot sign in.
   */
  const signInOffline = useCallback(
    async (signInPhone: string, value: string): Promise<string | null> => {
      const canUseFingerprint = biometricSupported && stored !== null && stored.phone === signInPhone;
      const result = await checkMpinOffline(signInPhone, value);
      if (!result.ok) return offlinePinMessage(result, canUseFingerprint);
      // Read again rather than trusting screen state: the profile must be the one the MPIN hash was saved for.
      const profile = await getStoredAccount();
      if (!profile || profile.phone !== signInPhone || profile.stellarPublicKey !== result.publicKey) {
        return offlinePinMessage({ ok: false, reason: 'unavailable' }, canUseFingerprint);
      }
      setSignInStep('Checking your wallet…');
      // Restoring a missing wallet needs an SMS code, so it waits for a connection.
      if (!(await holdsWalletFor(profile.stellarPublicKey))) {
        return "This phone doesn't have your wallet yet. Connect to the internet to restore it.";
      }
      await login(profile);
      void enterHive();
      return null;
    },
    [biometricSupported, stored, login, enterHive],
  );

  const submitPin = useCallback(
    async (value: string) => {
      if (!phone) return;
      const controller = new AbortController();
      request.current = controller;
      setSignInStep('Checking your MPIN…');
      setBusy(true);
      setError(null);
      const offline = async () => {
        const message = await signInOffline(phone, value);
        if (message) {
          setPin('');
          setError(message);
        }
      };
      try {
        if (!getConnectivity().online) {
          await offline();
          return;
        }
        let account: Awaited<ReturnType<typeof lookupUserByPhone>>;
        try {
          await verifyPin(phone, value, controller.signal);
          setSignInStep('Opening your account…');
          // The PIN route returns no profile, so fetch the account it unlocked.
          account = await lookupUserByPhone(phone, controller.signal);
        } catch (e) {
          // The phone thought it was online but the server could not be reached (weak signal, captive Wi-Fi).
          if (!isNoConnection(e)) throw e;
          await offline();
          return;
        }
        if (!account) throw new ApiError('http', 404, 'No account found for this number.');
        // The MPIN proves the account, not that this phone holds its wallet (a new device, or a re-created account).
        // Without the key nothing can be signed, so restore it from the recovery phrase before opening Home.
        setSignInStep('Checking your wallet…');
        if (!(await holdsWalletFor(account.stellarPublicKey))) {
          await startRecovery(phone, controller.signal);
          return;
        }
        await login({
          shortId: account.shortId,
          stellarPublicKey: account.stellarPublicKey,
          firstName: account.firstName,
          lastName: account.lastName,
          phone,
        });
        // Saved for the next sign-in with no connection. Sliced, so it does not hold up the entrance animation.
        void rememberMpin(phone, account.stellarPublicKey, value);
        void enterHive();
      } catch (e) {
        if (isAborted(e)) return;
        setPin('');
        setError(pinErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [login, phone, enterHive, startRecovery, signInOffline],
  );

  useEffect(() => {
    let active = true;
    void isBiometricAvailable().then((ok) => {
      if (active) setBiometricSupported(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  // A fingerprint is a local unlock of the account that last signed in with its MPIN on this phone, so it is
  // only offered when that account is the number shown here. It reopens the saved profile; it never creates one.
  const unlockable = biometricSupported && stored !== null && phone != null && stored.phone === phone;

  const signInWithBiometrics = useCallback(async () => {
    if (!stored || entering || busy) return;
    if (!(await authenticateWithBiometrics())) return;
    // Checking the wallet key takes a moment (it is derived from the stored phrase), so show "Signing in…" first.
    const controller = new AbortController();
    request.current = controller;
    setSignInStep('Checking your wallet…');
    setBusy(true);
    setError(null);
    try {
      await afterNextPaint();
      // The saved profile can outlive its wallet (or its account), so it only opens Home on a phone that holds the key.
      if (await holdsWalletFor(stored.stellarPublicKey)) {
        await login(stored);
        void enterHive();
        return;
      }
      await startRecovery(stored.phone ?? phone ?? '', controller.signal);
    } catch (e) {
      if (!isAborted(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [stored, phone, login, enterHive, entering, busy, startRecovery]);

  // Prompt once on arrival. Cancelling falls back to the MPIN.
  useEffect(() => {
    if (unlockable && !prompted.current) {
      prompted.current = true;
      void signInWithBiometrics();
    }
  }, [unlockable, signInWithBiometrics]);

  const onDigit = useCallback(
    (digit: string) => {
      if (busy || entering || !phone) return;
      const next = pin.length < MPIN_LENGTH ? pin + digit : pin;
      setPin(next);
      setError(null);
      if (next.length === MPIN_LENGTH) void submitPin(next);
    },
    [busy, entering, phone, pin, submitPin],
  );
  const onDelete = useCallback(() => {
    if (!busy && !entering) setPin((p) => p.slice(0, -1));
  }, [busy, entering]);

  return (
    <View style={styles.root}>
      <AppBackground />

      <View style={[styles.main, { paddingTop: topPad }]}>
        <Image source={logoHorizontal} style={styles.logo} contentFit="contain" accessibilityLabel="HoneBill" />

        {/* The mascot image is larger than its 260x200 slot (soft glow bleed); it overflows evenly. */}
        <View style={[styles.mascotArea, { height: mascotSlot }]}>
          <Mascot mood="idle" scale={mascotSlot / 200} animated={!entering} style={styles.mascot} />
        </View>

        <View style={styles.inputSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={phone ? `Signing in as ${formatPhoneDisplay(phone)}. Use another number` : 'Enter your phone number'}
            onPress={changeNumber}
            disabled={busy || entering}
            style={styles.phonePill}
          >
            <Text style={styles.phone}>{phone ? formatPhoneDisplay(phone) : phone === null ? 'Enter your number' : ' '}</Text>
            <View style={styles.swap}>
              <SwapIcon />
            </View>
          </Pressable>
          {error ? (
            <Text style={[styles.prompt, styles.error]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : (
            <Text style={styles.prompt}>
              {busy || entering ? 'Signing in…' : pinChanged ? 'MPIN changed. Enter your new MPIN' : locked ? 'Locked for your security. Enter your MPIN' : 'Enter your MPIN'}
            </Text>
          )}
          <PinDots length={MPIN_LENGTH} filled={pin.length} />
          {/* Only with a number to reset for; hidden while signing in so it cannot be tapped mid-request. */}
          {phone && !busy && !entering ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot MPIN? Reset it"
              hitSlop={10}
              onPress={() => navigation.navigate('ForgotMpin', { phone })}
              style={({ pressed }) => pressed && styles.forgotPressed}
            >
              <Text style={styles.forgot}>Forgot MPIN?</Text>
            </Pressable>
          ) : (
            <View style={styles.forgotSpace} />
          )}
        </View>
      </View>

      <View style={[styles.keypad, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Keypad onDigit={onDigit} onDelete={onDelete} onBiometric={unlockable && !entering ? signInWithBiometrics : undefined} />
      </View>

      {/* Covers the screen (and blocks Back) while the MPIN or fingerprint sign-in is checked. */}
      <ProcessingOverlay processing={busy ? { title: 'Signing you in', step: signInStep, hint: 'One moment…' } : null} />

      {/* Created only on success, so signing in carries none of its cost until then. */}
      {entering ? <HiveEntrance progress={progress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  main: { flex: 1, alignItems: 'center' },
  logo: { width: 133, height: 30, marginBottom: 17 },
  mascotArea: { width: '100%', maxWidth: 260, alignItems: 'center' },
  mascot: { marginTop: -20 },
  inputSection: { width: '100%', alignItems: 'center', paddingTop: 20, gap: 16 },
  // borderRed (not primary), like the OTP screen's links: orange on this background is too low-contrast to read.
  forgot: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.borderRed, textDecorationLine: 'underline' },
  forgotPressed: { opacity: 0.6 },
  // Holds the link's height while it is hidden, so the PIN dots and the keypad do not shift.
  forgotSpace: { height: 18 },
  phonePill: {
    width: '100%',
    maxWidth: 302,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderRed,
    backgroundColor: 'rgba(247, 247, 251, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: { fontFamily: fonts.regular, fontSize: 18, color: colors.coral, textAlign: 'center' },
  swap: { position: 'absolute', right: 26, top: 0, bottom: 0, justifyContent: 'center' },
  prompt: { width: '100%', maxWidth: 200, textAlign: 'center', fontFamily: fonts.light, fontSize: 16, color: colors.primary },
  error: { width: '100%', maxWidth: 280, textAlign: 'center', fontFamily: fonts.regular, fontSize: 15, color: colors.coral },
  keypad: { width: '100%' },
});
