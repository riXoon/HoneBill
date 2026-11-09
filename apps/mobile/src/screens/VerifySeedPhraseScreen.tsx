import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

const EMPTY = Array.from({ length: WORD_COUNT }, () => '');

const WordField = memo(function WordField({
  index,
  value,
  disabled,
  onChange,
  onSubmit,
  inputRef,
}: {
  index: number;
  value: string;
  disabled: boolean;
  onChange: (index: number, text: string) => void;
  onSubmit: (index: number) => void;
  inputRef: (index: number, node: TextInput | null) => void;
}) {
  const { focused, onFocus, onBlur } = useFieldFocus();
  return (
    <View style={[styles.field, fieldStateStyle(focused, value.length > 0)]}>
      <Text style={styles.index}>{index + 1}</Text>
      <TextInput
        ref={(node) => inputRef(index, node)}
        value={value}
        onChangeText={(text) => onChange(index, text)}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={() => onSubmit(index)}
        accessibilityLabel={`Word number ${index + 1}`}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        textContentType="none"
        importantForAutofill="no"
        editable={!disabled}
        blurOnSubmit={false}
        returnKeyType={index === WORD_COUNT - 1 ? 'done' : 'next'}
        style={styles.input}
      />
    </View>
  );
});

export function VerifySeedPhraseScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'VerifySeedPhrase'>) {
  const { phone } = route.params;
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<string[]>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(TextInput | null)[]>([]);
  const request = useRef<AbortController | null>(null);

  // What is typed here is the wallet's private key: keep it out of screenshots and the recent-apps preview.
  usePreventScreenCapture('verify-seed-phrase');

  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  const setInput = useCallback((index: number, node: TextInput | null) => {
    inputs.current[index] = node;
  }, []);

  const onChange = useCallback((index: number, text: string) => {
    setError(null);
    const pasted = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // Pasting the whole phrase (or several words) fills the boxes from this one onward.
    if (pasted.length > 1) {
      setWords((prev) => {
        const next = [...prev];
        pasted.slice(0, WORD_COUNT - index).forEach((word, offset) => {
          next[index + offset] = word;
        });
        return next;
      });
      Keyboard.dismiss();
      return;
    }
    setWords((prev) => {
      const next = [...prev];
      next[index] = text.trim().toLowerCase();
      return next;
    });
  }, []);

  const onSubmitWord = useCallback((index: number) => {
    if (index < WORD_COUNT - 1) inputs.current[index + 1]?.focus();
    else Keyboard.dismiss();
  }, []);

  const verify = async () => {
    if (busy) return;
    if (words.some((w) => !w)) {
      setError('Enter all 12 words.');
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
      setWords(EMPTY);
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
            account. You can paste all of it into the first box. Never share these words with anyone.
          </Text>
        </View>

        <View style={styles.grid}>
          {words.map((word, index) => (
            <View key={index} style={styles.cell}>
              <WordField
                index={index}
                value={word}
                disabled={busy}
                onChange={onChange}
                onSubmit={onSubmitWord}
                inputRef={setInput}
              />
            </View>
          ))}
        </View>

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
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48%' },
  field: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.field,
    borderWidth: 1,
  },
  index: { width: 16, fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  input: { flex: 1, height: '100%', padding: 0, fontFamily: fonts.light, fontSize: 12, color: colors.text },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral },
  // The mascot image is larger than its slot (soft glow bleed), so it overflows evenly.
  mascot: { height: 230, alignItems: 'center', justifyContent: 'center' },
});
