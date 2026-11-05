import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '../components/send/GlassCard';
import { AppBackground } from '../components/ui/AppBackground';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { CopyIcon, InfoIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { copySensitive } from '../services/secureClipboard';
import { getDeviceRecoveryWords } from '../services/wallet/deviceWallet';
import { colors, fonts } from '../theme';

// MVP page: the designer's version replaces this one. It only has to let a tester back up the
// phrase for real. Built from existing tokens and components (GlassCard, GradientTitle, Button).
const HALF = 6;

type Words = { status: 'loading' } | { status: 'error' } | { status: 'ready'; words: string[] };

function WordColumn({ words, offset }: { words: string[]; offset: number }) {
  return (
    <View style={styles.column}>
      {words.map((word, i) => (
        <View key={offset + i} style={styles.chip} accessible accessibilityLabel={`Word ${offset + i + 1}, ${word}`}>
          <Text style={styles.chipIndex}>{offset + i + 1}</Text>
          <Text style={styles.chipWord}>{word}</Text>
        </View>
      ))}
    </View>
  );
}

export function RecoveryPhraseScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RecoveryPhrase'>) {
  const insets = useSafeAreaInsets();
  const [phrase, setPhrase] = useState<Words>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

  // The phrase is the account's private key: block screenshots and the recent-apps preview while it shows.
  usePreventScreenCapture('recovery-phrase');

  const load = useCallback(() => {
    setPhrase({ status: 'loading' });
    getDeviceRecoveryWords()
      .then((words) => setPhrase(words ? { status: 'ready', words } : { status: 'error' }))
      .catch((e) => {
        reportError(e, { step: 'loadRecoveryWords' });
        setPhrase({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    load();
    // Drop the words from memory when leaving the screen.
    return () => setPhrase({ status: 'loading' });
  }, [load]);

  // The account already exists, so leaving without seeing the phrase would lose it for good.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const copy = async () => {
    if (phrase.status !== 'ready') return;
    try {
      await copySensitive(phrase.words.join(' '));
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Recovery phrase copied. The clipboard clears in 60 seconds.');
    } catch (e) {
      reportError(e, { step: 'copyRecoveryPhrase' });
    }
  };

  // `navigate`, not `reset`: the quiz's "Review my phrase" comes back here.
  const next = () => navigation.navigate('RecoveryQuiz');

  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(40, insets.top + 24), paddingBottom: Math.max(24, insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <GradientTitle>Your Recovery Phrase</GradientTitle>
          <Text style={styles.subtitle}>
            These 12 words are the only way to get your wallet back if you lose this phone. Write them down in order.
          </Text>
        </View>

        <GlassCard style={styles.card}>
          {phrase.status === 'ready' ? (
            <View style={styles.columns}>
              <WordColumn words={phrase.words.slice(0, HALF)} offset={0} />
              <WordColumn words={phrase.words.slice(HALF)} offset={HALF} />
            </View>
          ) : phrase.status === 'loading' ? (
            <Text style={styles.status}>Loading your phrase…</Text>
          ) : (
            <View style={styles.errorBlock}>
              <Text style={styles.status} accessibilityRole="alert">
                We could not read your recovery phrase from this device.
              </Text>
              <Pressable accessibilityRole="button" onPress={load} hitSlop={8}>
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </View>
          )}
        </GlassCard>

        <View style={styles.copyBlock}>
          <Button
            label={copied ? 'Copied' : 'Copy phrase'}
            variant="outline"
            icon={<CopyIcon color={colors.primary} size={20} />}
            onPress={() => void copy()}
            disabled={phrase.status !== 'ready'}
          />
          <Text style={styles.copyNote}>
            Other apps can read the clipboard, so it clears itself after 60 seconds. Writing the words on paper is safer.
          </Text>
        </View>

        <View style={styles.warning}>
          <InfoIcon color={colors.coral} size={20} />
          <Text style={styles.warningText}>
            Never share these words. Anyone who has them can take your funds, and HoneBill cannot recover them for you.
          </Text>
        </View>

        <Button label="I have saved it" size="large" onPress={next} disabled={phrase.status !== 'ready'} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 40, gap: 24 },
  header: { gap: 10 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  card: { padding: 16 },
  columns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1, gap: 8 },
  chip: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surfaceTranslucent,
  },
  chipIndex: { width: 16, fontFamily: fonts.light, fontSize: 10, color: colors.textMuted },
  chipWord: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  status: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  errorBlock: { alignItems: 'center', gap: 4 },
  retry: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary, paddingBottom: 12 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.yellow,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  warningText: { flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, color: colors.text },
  copyBlock: { gap: 8 },
  copyNote: { fontFamily: fonts.light, fontSize: 11, lineHeight: 16, color: colors.textMuted, textAlign: 'center' },
});
