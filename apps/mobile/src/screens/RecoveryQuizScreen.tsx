import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { fieldStateStyle, useFieldFocus } from '../components/ui/fieldState';
import { LockIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { getDeviceRecoveryWords } from '../services/wallet/deviceWallet';
import { QUIZ_LENGTH, buildRecoveryQuiz, type QuizQuestion } from '../services/wallet/recoveryQuiz';
import { colors, fonts, radius } from '../theme';

// Figma "Confirm Seed Phrase" (1131:4178): one word per question, typed in. QUIZ_LENGTH questions in a row; the card
// swaps with the next one after a right answer: a copy of the old card leaves to the left while the live card comes in from the right.
// `done` means every word was confirmed and the phrase has been dropped from memory.
type Quiz = { status: 'loading' } | { status: 'error' } | { status: 'done' } | { status: 'ready'; questions: QuizQuestion[] };

const SWAP_MS = 300;
const IN_TIMING = { duration: SWAP_MS, easing: Easing.out(Easing.cubic) };
const OUT_TIMING = { duration: SWAP_MS, easing: Easing.in(Easing.cubic) };

/** The old card while it leaves: a lookalike that cannot be touched, so the real TextInput never remounts. */
type Ghost = { position: number; text: string };

const ORDINAL_SUFFIX = ['th', 'st', 'nd', 'rd'];
function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIX[(v - 20) % 10] ?? ORDINAL_SUFFIX[v] ?? ORDINAL_SUFFIX[0]}`;
}

/** Alert glyph (Figma Alert, 12x12), same as TextField's. */
function AlertIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path
        d="M6 0C2.68661 0 0 2.68661 0 6C0 9.31339 2.68661 12 6 12C9.31339 12 12 9.31339 12 6C12 2.68661 9.31339 0 6 0ZM6 10.9821C3.24911 10.9821 1.01786 8.75089 1.01786 6C1.01786 3.24911 3.24911 1.01786 6 1.01786C8.75089 1.01786 10.9821 3.24911 10.9821 6C10.9821 8.75089 8.75089 10.9821 6 10.9821Z"
        fill={colors.coral}
      />
      <Path
        d="M5.4375 3.9375C5.4375 4.08668 5.49676 4.22976 5.60225 4.33525C5.70774 4.44074 5.85082 4.5 6 4.5C6.14918 4.5 6.29226 4.44074 6.39775 4.33525C6.50324 4.22976 6.5625 4.08668 6.5625 3.9375C6.5625 3.78832 6.50324 3.64524 6.39775 3.53975C6.29226 3.43426 6.14918 3.375 6 3.375C5.85082 3.375 5.70774 3.43426 5.60225 3.53975C5.49676 3.64524 5.4375 3.78832 5.4375 3.9375ZM6.28125 5.25H5.71875C5.66719 5.25 5.625 5.29219 5.625 5.34375V8.53125C5.625 8.58281 5.66719 8.625 5.71875 8.625H6.28125C6.33281 8.625 6.375 8.58281 6.375 8.53125V5.34375C6.375 5.29219 6.33281 5.25 6.28125 5.25Z"
        fill={colors.coral}
      />
    </Svg>
  );
}

function QuizCard({ position, error, children }: { position: number; error: string | null; children: ReactNode }) {
  return (
    <>
      <Text style={styles.question} accessibilityRole="header">
        What was your {ordinal(position)} word?
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Word #{position}</Text>
        {children}
        {/* Always reserve the row so the layout does not jump when an error appears. */}
        <View style={[styles.alert, !error && styles.alertHidden]} accessibilityLiveRegion="polite">
          <AlertIcon />
          <Text style={styles.alertText}>{error ?? ' '}</Text>
        </View>
      </View>
    </>
  );
}

/** The answer box, with its own blank / filled / selected styling. */
function AnswerField({
  position,
  value,
  onChangeText,
  onSubmit,
}: {
  position: number;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
}) {
  const { focused, onFocus, onBlur } = useFieldFocus();
  return (
    <View style={[styles.field, fieldStateStyle(focused, value.length > 0)]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={onSubmit}
        placeholder="Enter the word"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={`Word number ${position}`}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        textContentType="none"
        importantForAutofill="no"
        returnKeyType="done"
        style={styles.input}
      />
      <LockIcon color={colors.primary} size={24} />
    </View>
  );
}

export function RecoveryQuizScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RecoveryQuiz'>) {
  const insets = useSafeAreaInsets();
  const [quiz, setQuiz] = useState<Quiz>({ status: 'loading' });
  const [words, setWords] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // Counts right answers that swap the card, so the slide starts after the new question has rendered.
  const [swap, setSwap] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const liveX = useSharedValue(0);
  const ghostX = useSharedValue(0);

  const liveStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, liveX.value / screenWidth) * 0.8,
    transform: [{ translateX: liveX.value }],
  }));
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: 1 + Math.max(-1, ghostX.value / screenWidth) * 0.8,
    transform: [{ translateX: ghostX.value }],
  }));
  const clearGhost = useCallback(() => setGhost(null), []);

  useEffect(() => {
    if (swap === 0) return;
    liveX.value = withTiming(0, IN_TIMING);
    ghostX.value = withTiming(-screenWidth, OUT_TIMING, (finished) => {
      if (finished) scheduleOnRN(clearGhost);
    });
  }, [swap, screenWidth, liveX, ghostX, clearGhost]);

  // The typed word comes from the phrase: keep it out of screenshots and the recent-apps preview.
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

  const onChangeAnswer = useCallback((value: string) => {
    setAnswer(value);
    setError(null);
  }, []);

  const verify = () => {
    if (quiz.status !== 'ready') return;
    const typed = answer.trim().toLowerCase();
    if (!typed) {
      setError('Input is required');
      return;
    }
    if (typed !== quiz.questions[step].answer) {
      // Fresh positions, so a wrong guess cannot be walked through the same questions.
      setError('That is not the right word. Check your written copy and try again with new questions.');
      setStep(0);
      setAnswer('');
      if (words) setQuiz({ status: 'ready', questions: buildRecoveryQuiz(words) });
      return;
    }
    setError(null);
    if (step + 1 < quiz.questions.length) {
      if (!reduceMotion) {
        // Park the live card off to the right and show the old one in its place before anything re-renders.
        liveX.value = screenWidth;
        ghostX.value = 0;
        setGhost({ position: quiz.questions[step].position, text: answer.trim() });
        setSwap((n) => n + 1);
      }
      setStep(step + 1);
      setAnswer('');
      return;
    }
    // All words confirmed: clear what was typed and drop the phrase from memory before moving on.
    Keyboard.dismiss();
    setAnswer('');
    setWords(null);
    setQuiz({ status: 'done' });
    navigation.reset({ index: 0, routes: [{ name: 'AccountConfirmation' }] });
  };

  const question = quiz.status === 'ready' ? quiz.questions[step] : null;

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
          <GradientTitle>Confirm Seed Phrase</GradientTitle>
          <Text style={styles.subtitle}>
            {question
              ? `Enter the word at position #${question.position} to verify your recovery phrase. Never share these words with anyone.`
              : 'Enter a word from your recovery phrase to verify it. Never share these words with anyone.'}
          </Text>
        </View>

        {question ? (
          <>
            <View style={styles.progress} accessible accessibilityLabel={`Question ${step + 1} of ${QUIZ_LENGTH}`}>
              {Array.from({ length: QUIZ_LENGTH }, (_, i) => (
                <View key={i} style={[styles.bar, i <= step && styles.barDone]} />
              ))}
            </View>

            <View>
              <Animated.View style={[styles.card, liveStyle]}>
                <QuizCard position={question.position} error={error}>
                  <AnswerField
                    position={question.position}
                    value={answer}
                    onChangeText={onChangeAnswer}
                    onSubmit={verify}
                  />
                </QuizCard>
              </Animated.View>
              {ghost ? (
                <Animated.View
                  pointerEvents="none"
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.card, styles.ghost, ghostStyle]}
                >
                  <QuizCard position={ghost.position} error={null}>
                    <View style={[styles.field, fieldStateStyle(false, true)]}>
                      <Text style={styles.input}>{ghost.text}</Text>
                      <LockIcon color={colors.primary} size={24} />
                    </View>
                  </QuizCard>
                </Animated.View>
              ) : null}
            </View>

            <Button label="Verify" size="large" onPress={verify} />
          </>
        ) : quiz.status === 'done' ? null : quiz.status === 'loading' ? (
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
  ghost: { position: 'absolute', top: 0, left: 0, right: 0 },
  progress: { flexDirection: 'row', gap: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.primarySoft },
  barDone: { backgroundColor: colors.primary },
  card: {
    gap: 10,
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 4,
  },
  question: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  inputGroup: { gap: 8 },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  field: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: radius.field,
    borderWidth: 1,
  },
  input: { flex: 1, height: '100%', padding: 0, fontFamily: fonts.light, fontSize: 14, color: colors.text },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 12 },
  alertHidden: { opacity: 0 },
  alertText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.coral },
  // The mascot image is larger than its slot (soft glow bleed), so it overflows evenly.
  mascot: { height: 230, alignItems: 'center', justifyContent: 'center' },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  errorBlock: { alignItems: 'center', gap: 4 },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary, textAlign: 'center' },
});
