import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { fieldStateStyle, useFieldFocus } from '../components/ui/fieldState';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { setAccountPhone } from '../services/accountPhone';
import { errorMessage, isAborted } from '../services/api/client';
import { checkUser } from '../services/api/users';
import { reportError } from '../services/errorReporting';
import { restoreDeviceWallet } from '../services/wallet/deviceWallet';
import { isValidMnemonic, publicKeyFromMnemonic } from '../services/wallet/stellarKeys';
import { colors, fonts, radius } from '../theme';

// Sign-in on a phone that does not hold the account's wallet: the 12 words saved at sign-up bring it back.
const WORD_COUNT = 12;

/** Whatever was pasted or typed -> the lowercase words, separated by single spaces. */
function normalize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

export function VerifySeedPhraseScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'VerifySeedPhrase'>) {
  const { phone } = route.params;
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const { focused, onFocus, onBlur } = useFieldFocus();
  const words = useMemo(() => normalize(text), [text]);

  // What is typed here is the wallet's private key: keep it out of screenshots and the recent-apps preview.
  usePreventScreenCapture('verify-seed-phrase');

  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  const onChangeText = (value: string) => {
    setError(null);
    setText(value);
  };

  const paste = async () => {
    try {
      const copied = await Clipboard.getStringAsync();
      if (copied) onChangeText(copied);
    } catch {
      setError('Could not read the clipboard. Paste into the box manually.');
    }
  };

  const verify = async () => {
    if (busy) return;
    if (words.length !== WORD_COUNT) {
      setError(`Enter all ${WORD_COUNT} words. You have ${words.length}.`);
      return;
    }
    const mnemonic = words.join(' ');
    if (!isValidMnemonic(mnemonic)) {
      setError('These words are not a valid recovery phrase. Check the spelling and the order.');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      const [account, publicKey] = await Promise.all([checkUser(phone, controller.signal), publicKeyFromMnemonic(mnemonic)]);
      if (!account.exists) {
        setError('No account found for this number.');
        return;
      }
      if (account.stellarPublicKey !== publicKey) {
        setError('This recovery phrase does not belong to this account.');
        return;
      }
      await restoreDeviceWallet(mnemonic);
      await setAccountPhone(phone);
      setText('');
      // The wallet is back on this phone; the MPIN is the last step.
      navigation.reset({ index: 1, routes: [{ name: 'Landing' }, { name: 'Login' }] });
    } catch (e) {
      if (isAborted(e)) return;
      reportError(e, { step: 'restoreWallet' });
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(100, insets.top + 68), paddingBottom: Math.max(24, insets.bottom) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <GradientTitle>Verify Seed Phrase</GradientTitle>
          <Text style={styles.subtitle}>
            This phone does not have your wallet yet. Enter the 12-word recovery phrase you saved when you created your
            account. Paste all 12 words in one go. Never share these words with anyone.
          </Text>
        </View>

        <View style={[styles.box, fieldStateStyle(focused, text.length > 0)]}>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            accessibilityLabel="Recovery phrase"
            placeholder="Paste your 12 words here"
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            textContentType="none"
            importantForAutofill="no"
            keyboardType="visible-password"
            editable={!busy}
            textAlignVertical="top"
            style={styles.input}
          />
        </View>
        <Text style={styles.count}>
          {words.length} / {WORD_COUNT} words
        </Text>
        <Button label="Paste from clipboard" variant="outline" onPress={() => void paste()} disabled={busy} />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button label={busy ? 'Restoring…' : 'Restore wallet'} size="large" onPress={() => void verify()} disabled={busy} />

        <View style={styles.mascot} pointerEvents="none">
          <Mascot mood="question" width={200} />
        </View>
      </ScrollView>
      {/* After the ScrollView so it sits on top: a full-screen ScrollView drawn later would swallow its taps. */}
      <AuthChrome onBack={navigation.goBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 40, gap: 20 },
  header: { gap: 10 },
  subtitle: { fontFamily: fonts.light, fontSize: 15, color: colors.textMuted },
  box: { minHeight: 130, padding: 14, borderRadius: radius.field, borderWidth: 1 },
  input: { minHeight: 100, padding: 0, fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.text },
  count: { fontFamily: fonts.light, fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral },
  // The mascot image is larger than its slot (soft glow bleed), so it overflows evenly.
  mascot: { height: 230, alignItems: 'center', justifyContent: 'center' },
});
