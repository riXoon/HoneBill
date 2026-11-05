import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { getDeviceRecoveryWords } from '../services/wallet/deviceWallet';
import { QUIZ_LENGTH, buildRecoveryQuiz, type QuizQuestion } from '../services/wallet/recoveryQuiz';
import { colors, fonts } from '../theme';

// MVP page: the designer's version replaces this one. Same tokens and components as the rest of onboarding.
type Quiz = { status: 'loading' } | { status: 'error' } | { status: 'ready'; questions: QuizQuestion[] };

export function RecoveryQuizScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RecoveryQuiz'>) {
  const insets = useSafeAreaInsets();
  const [quiz, setQuiz] = useState<Quiz>({ status: 'loading' });
  const [words, setWords] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(false);

  // The options are words from the phrase: keep them out of screenshots and the recent-apps preview.
  usePreventScreenCapture('recovery-quiz');

  const load = useCallback(() => {
    setQuiz({ status: 'loading' });
    getDeviceRecoveryWords()
      .then((loaded) => {
        if (!loaded) {
          setQuiz({ status: 'error' });
          return;
        }
        setWords(loaded);
        setQuiz({ status: 'ready', questions: buildRecoveryQuiz(loaded) });
      })
      .catch((e) => {
        reportError(e, { step: 'loadRecoveryQuiz' });
        setQuiz({ status: 'error' });
      });
  }, []);

  useEffect(() => {
    load();
    // Drop the words from memory when leaving the screen.
    return () => {
      setWords(null);
      setQuiz({ status: 'loading' });
    };
  }, [load]);

  const pick = (option: string) => {
    if (quiz.status !== 'ready') return;
    const question = quiz.questions[step];
    if (option !== question.answer) {
      // Fresh positions and decoys, so the answer cannot be found by tapping through the options.
      setWrong(true);
      setStep(0);
      if (words) setQuiz({ status: 'ready', questions: buildRecoveryQuiz(words) });
      return;
    }
    setWrong(false);
    if (step + 1 < quiz.questions.length) setStep(step + 1);
    else navigation.reset({ index: 0, routes: [{ name: 'AccountConfirmation' }] });
  };

  const question = quiz.status === 'ready' ? quiz.questions[step] : null;

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome onBack={navigation.goBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(100, insets.top + 68), paddingBottom: Math.max(24, insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <GradientTitle>Confirm Your Phrase</GradientTitle>
          <Text style={styles.subtitle}>
            Pick the right word each time to show you saved your recovery phrase.
          </Text>
        </View>

        <View style={styles.mascot} pointerEvents="none">
          <Mascot mood="question" width={200} />
        </View>

        {question ? (
          <>
            <View style={styles.progress} accessibilityLabel={`Question ${step + 1} of ${QUIZ_LENGTH}`}>
              {Array.from({ length: QUIZ_LENGTH }, (_, i) => (
                <View key={i} style={[styles.bar, i <= step && styles.barDone]} />
              ))}
            </View>

            <GlassCard style={styles.questionCard}>
              <Text style={styles.questionLabel}>
                Question {step + 1} of {QUIZ_LENGTH}
              </Text>
              <Text style={styles.question} accessibilityRole="header">
                What is word #{question.position}?
              </Text>
            </GlassCard>

            <View style={styles.options}>
              {question.options.map((option) => (
                <Button key={option} label={option} variant="outline" size="large" onPress={() => pick(option)} />
              ))}
            </View>

            {wrong ? (
              <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
                That is not the right word. Check your written copy and try again with new questions.
              </Text>
            ) : null}
          </>
        ) : quiz.status === 'loading' ? (
          <Text style={styles.status}>Preparing your questions…</Text>
        ) : (
          <View style={styles.errorBlock}>
            <Text style={styles.status} accessibilityRole="alert">
              We could not read your recovery phrase from this device.
            </Text>
            <Pressable accessibilityRole="button" onPress={load} hitSlop={8}>
              <Text style={styles.link}>Try again</Text>
            </Pressable>
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={navigation.goBack} hitSlop={8} style={styles.reviewRow}>
          <Text style={styles.link}>Review my phrase</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 40, gap: 20 },
  header: { gap: 10 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  // The mascot image is larger than its slot (soft glow bleed), so it overflows evenly.
  mascot: { height: 120, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.primarySoft },
  barDone: { backgroundColor: colors.primary },
  questionCard: { padding: 20, gap: 6, alignItems: 'center' },
  questionLabel: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted },
  question: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text },
  options: { gap: 12 },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral, textAlign: 'center' },
  status: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  errorBlock: { alignItems: 'center', gap: 4 },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary, textAlign: 'center' },
  reviewRow: { alignItems: 'center', paddingVertical: 8 },
});
