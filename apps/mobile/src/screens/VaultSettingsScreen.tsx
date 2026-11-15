import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';

import { Button } from '../components/ui/Button';
import { PinDialog } from '../components/ui/PinDialog';
import { SettingsPage } from '../components/ui/SettingsPage';
import { CopyIcon } from '../components/ui/smallIcons';
import { useAuth } from '../context/AuthContext';
import { useIsOnline } from '../hooks/useIsOnline';
import type { RootStackParamList } from '../navigation/types';
import { verifyPin } from '../services/api/auth';
import { errorMessage } from '../services/api/client';
import { authenticateWithBiometrics, isBiometricAvailable } from '../services/biometrics';
import { reportError } from '../services/errorReporting';
import { getOfflineSetup } from '../services/offline/offlineConfig';
import { ensureOfflineReady } from '../services/offline/setup';
import { rememberMpin } from '../services/offlineMpin';
import { pinErrorMessage } from '../services/pinErrors';
import { copySensitive } from '../services/secureClipboard';
import { getDeviceRecoveryWords } from '../services/wallet/deviceWallet';
import { isValidStellarPublicKey } from '../services/wallet/stellarKeys';
import { colors, fonts } from '../theme';

/** The phrase hides itself after this long, so it is never left on screen. */
const REVEAL_MS = 60_000;
const CAPTURE_KEY = 'vault-settings-phrase';

type Offline = { status: 'checking' } | { status: 'ready'; deviceKey: string } | { status: 'missing' };

function shorten(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

export function VaultSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'VaultSettings'>) {
  const { activeAccount } = useAuth();
  const online = useIsOnline();
  const stored = activeAccount?.stellarPublicKey ?? '';
  const address = isValidStellarPublicKey(stored) ? stored : '';

  const [addressCopied, setAddressCopied] = useState(false);
  const [words, setWords] = useState<string[] | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [offline, setOffline] = useState<Offline>({ status: 'checking' });
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const timers = useRef<{ address?: ReturnType<typeof setTimeout>; phrase?: ReturnType<typeof setTimeout> }>({});
  const mounted = useRef(true);

  const hidePhrase = useCallback(() => {
    if (timers.current.phrase) clearTimeout(timers.current.phrase);
    setWords(null);
    setPhraseCopied(false);
  }, []);

  useEffect(
    () => () => {
      mounted.current = false;
      if (timers.current.address) clearTimeout(timers.current.address);
      if (timers.current.phrase) clearTimeout(timers.current.phrase);
    },
    [],
  );

  // The phrase is the wallet's private key: block screenshots while it shows, and hide it when the user leaves
  // the screen or the app goes to the background.
  useEffect(() => {
    if (!words) return;
    void preventScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') hidePhrase();
    });
    return () => {
      sub.remove();
      void allowScreenCaptureAsync(CAPTURE_KEY).catch(() => {});
    };
  }, [words, hidePhrase]);
  useFocusEffect(useCallback(() => hidePhrase, [hidePhrase]));

  const loadOffline = useCallback(async () => {
    if (!address) return;
    const setup = await getOfflineSetup(address);
    if (mounted.current) setOffline(setup ? { status: 'ready', deviceKey: setup.deviceKey } : { status: 'missing' });
  }, [address]);
  useEffect(() => {
    void loadOffline();
  }, [loadOffline]);

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setAddressCopied(true);
    if (timers.current.address) clearTimeout(timers.current.address);
    timers.current.address = setTimeout(() => setAddressCopied(false), 1800);
    AccessibilityInfo.announceForAccessibility('Vault address copied');
  };

  const show = async () => {
    try {
      const recovered = await getDeviceRecoveryWords();
      if (!recovered) {
        setPhraseError('This phone does not hold the recovery phrase for this account.');
        return;
      }
      setPhraseError(null);
      setWords(recovered);
      timers.current.phrase = setTimeout(hidePhrase, REVEAL_MS);
    } catch (e) {
      reportError(e, { step: 'revealRecoveryPhrase' });
      setPhraseError('We could not read the recovery phrase on this phone.');
    }
  };

  /** A fingerprint is enough when the phone has one; otherwise (or if it is declined) the MPIN is asked for. */
  const reveal = async () => {
    setPhraseError(null);
    if ((await isBiometricAvailable()) && (await authenticateWithBiometrics('Show your recovery phrase'))) {
      await show();
      return;
    }
    setAskPin(true);
  };

  const checkPin = async (pin: string): Promise<string | null> => {
    const phone = activeAccount?.phone;
    if (!phone) return 'This account has no phone number on this device.';
    try {
      await verifyPin(phone, pin);
    } catch (e) {
      return pinErrorMessage(e);
    }
    // The server just accepted it: keep it for signing in offline too.
    if (activeAccount) void rememberMpin(phone, activeAccount.stellarPublicKey, pin);
    setAskPin(false);
    await show();
    return null;
  };

  const copyPhrase = async () => {
    if (!words) return;
    try {
      await copySensitive(words.join(' '));
      setPhraseCopied(true);
      AccessibilityInfo.announceForAccessibility('Recovery phrase copied. The clipboard clears in 60 seconds.');
    } catch (e) {
      reportError(e, { step: 'copyRecoveryPhrase' });
    }
  };

  const setUpOffline = async () => {
    if (!address || settingUp) return;
    setSettingUp(true);
    setSetupError(null);
    try {
      await ensureOfflineReady(address);
      await loadOffline();
    } catch (e) {
      setSetupError(errorMessage(e));
    } finally {
      if (mounted.current) setSettingUp(false);
    }
  };

  return (
    <SettingsPage title="Vault Settings" subtitle="Your wallet address, recovery phrase and offline payments." onBack={navigation.goBack}>
      <Section title="Vault address">
        <Text style={styles.address} selectable>
          {address || 'Vault address unavailable'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={address ? 'Copy vault address' : 'Vault address unavailable'}
          disabled={!address}
          onPress={() => void copyAddress()}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed, !address && styles.disabled]}
        >
          <CopyIcon color={colors.primary} size={18} />
          <Text style={styles.pillText}>{addressCopied ? 'Copied!' : 'Copy address'}</Text>
        </Pressable>
      </Section>

      <Section title="Recovery phrase">
        {words ? (
          <>
            <View style={styles.grid}>
              {words.map((word, i) => (
                <View key={i} style={styles.word} accessible accessibilityLabel={`Word ${i + 1}, ${word}`}>
                  <Text style={styles.wordNumber}>{i + 1}</Text>
                  <Text style={styles.wordText} numberOfLines={1} adjustsFontSizeToFit>
                    {word}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.warning}>Anyone with these 12 words can take your money. Never share them. They hide again in a minute.</Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void copyPhrase()}
                style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
              >
                <CopyIcon color={colors.primary} size={18} />
                <Text style={styles.pillText}>{phraseCopied ? 'Copied!' : 'Copy phrase'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={hidePhrase} style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
                <Text style={styles.pillText}>Hide</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              These 12 words restore your wallet on a new phone. We will ask for your fingerprint or MPIN before showing them.
            </Text>
            <Button label="Show recovery phrase" size="large" onPress={() => void reveal()} />
          </>
        )}
        {phraseError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {phraseError}
          </Text>
        ) : null}
      </Section>

      <Section title="Offline payments">
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: offline.status === 'ready' ? colors.statusOnline : colors.statusOffline }]} />
          <Text style={styles.statusText}>
            {offline.status === 'checking' ? 'Checking…' : offline.status === 'ready' ? 'Ready to pay without internet' : 'Not set up on this phone yet'}
          </Text>
        </View>
        {offline.status === 'ready' ? <Text style={styles.body}>Offline key: {shorten(offline.deviceKey)}</Text> : null}
        {offline.status === 'missing' ? (
          <>
            <Text style={styles.body}>
              {online ? 'Set this up once while you are online, so you can send money later with no connection.' : 'Connect to the internet to set this up.'}
            </Text>
            <Button label={settingUp ? 'Setting up…' : 'Set up now'} size="large" onPress={() => void setUpOffline()} disabled={!online || settingUp} />
          </>
        ) : null}
        {setupError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {setupError}
          </Text>
        ) : null}
      </Section>

      <PinDialog
        visible={askPin}
        title="Confirm with your MPIN"
        message="Enter your 4-digit MPIN to show your recovery phrase."
        onSubmit={checkPin}
        onCancel={() => setAskPin(false)}
      />
    </SettingsPage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.card,
  },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.light, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  address: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.yellow,
  },
  pillText: { fontFamily: fonts.medium, fontSize: 14, color: colors.borderRed },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: 'row', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    width: '31%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  wordNumber: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  wordText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  warning: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.coral },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
});
