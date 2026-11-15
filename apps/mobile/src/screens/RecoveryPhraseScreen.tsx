import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '../components/ui/AppBackground';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { RecoveryPhraseDialog } from '../components/ui/RecoveryPhraseDialog';
import { CheckTitleIcon, CopyIcon, LockIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { copySensitive } from '../services/secureClipboard';
import { getDeviceRecoveryWords } from '../services/wallet/deviceWallet';
import { useT } from '../i18n';
import { colors, fonts } from '../theme';

// Figma "Seed Phrase" (1131:4123): 12 words in a 3-column grid inside a card, then a security reminder.
const COLUMNS = 3;

type Words = { status: 'loading' } | { status: 'error' } | { status: 'ready'; words: string[] };

function chunk(words: string[]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < words.length; i += COLUMNS) rows.push(words.slice(i, i + COLUMNS));
  return rows;
}

export function RecoveryPhraseScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RecoveryPhrase'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [phrase, setPhrase] = useState<Words>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

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

  // The account already exists, so leaving without seeing the phrase would lose it for good. There is no back
  // button here; the quiz's back button is the way back to this screen if the user has not saved the words yet.
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
      AccessibilityInfo.announceForAccessibility(t.recovery.copiedAnnounce);
    } catch (e) {
      reportError(e, { step: 'copyRecoveryPhrase' });
    }
  };

  // `navigate`, not `reset`: the quiz's back button comes back here, and the quiz starts again from question 1.
  const next = () => navigation.navigate('RecoveryQuiz');

  const ready = phrase.status === 'ready';

  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(100, insets.top + 68), paddingBottom: Math.max(24, insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <GradientTitle>Seed Phrase</GradientTitle>
          <Text style={styles.subtitle}>{t.recovery.subtitle}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.titleGroup}>
              <View style={styles.iconWrap}>
                <LockIcon color={colors.primary} size={24} />
              </View>
              <Text style={styles.cardTitle}>Recovery Phrase</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copied ? t.recovery.copied : t.recovery.copyA11y}
              accessibilityState={{ disabled: !ready }}
              disabled={!ready}
              onPress={() => void copy()}
              style={({ pressed }) => [styles.copyPill, pressed && styles.pressed, !ready && styles.disabled]}
            >
              <CopyIcon color={colors.primary} size={10} />
              <Text style={styles.copyLabel}>{copied ? t.recovery.copied : t.recovery.copy}</Text>
            </Pressable>
          </View>

          {phrase.status === 'ready' ? (
            <View style={styles.grid}>
              {chunk(phrase.words).map((row, r) => (
                <View key={r} style={styles.row}>
                  {row.map((word, c) => {
                    const n = r * COLUMNS + c + 1;
                    return (
                      <View key={n} style={styles.word} accessible accessibilityLabel={t.recovery.wordA11y(n, word)}>
                        <Text style={styles.wordText} numberOfLines={1} adjustsFontSizeToFit>
                          {n}. {word}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : phrase.status === 'loading' ? (
            <Text style={styles.status}>{t.recovery.loading}</Text>
          ) : (
            <View style={styles.errorBlock}>
              <Text style={styles.status} accessibilityRole="alert">
                {t.recovery.readFailed}
              </Text>
              <Pressable accessibilityRole="button" onPress={load} hitSlop={8}>
                <Text style={styles.retry}>{t.common.tryAgain}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.reminder}>
          <View style={styles.reminderHeader}>
            <CheckTitleIcon color={colors.primary} size={24} />
            <Text style={styles.reminderTitle}>{t.recovery.reminderTitle}</Text>
          </View>
          <Text style={styles.reminderText}>{t.recovery.reminderBody}</Text>
        </View>

        <View style={styles.spacer} />

        <Button label={t.recovery.saved} size="large" onPress={next} disabled={!ready} />
      </ScrollView>
      <RecoveryPhraseDialog visible={showInfo} onDismiss={() => setShowInfo(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 40, gap: 16 },
  header: { gap: 10, marginBottom: 24 },
  subtitle: { fontFamily: fonts.light, fontSize: 15, color: colors.textMuted },
  card: {
    gap: 16,
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  copyLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  word: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12 },
  wordText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  errorBlock: { alignItems: 'center', gap: 4 },
  retry: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary, paddingBottom: 12 },
  reminder: { gap: 12, padding: 20, borderRadius: 20, backgroundColor: 'rgba(247, 247, 251, 0.2)' },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  reminderText: { fontFamily: fonts.light, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  spacer: { flexGrow: 1, minHeight: 8 },
});
