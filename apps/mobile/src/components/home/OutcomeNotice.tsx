import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { PaymentOutcomes } from '../../context/WalletDataContext';
import { colors, fonts } from '../../theme';

const FADE_MS = 250;

function plural(count: number, word: string): string {
  return `${count} offline ${word}${count === 1 ? '' : 's'}`;
}

/** What happened to offline payments since the user last looked, e.g. "1 offline payment did not go through…". */
export function outcomeMessage({ settled, failed, unconfirmed }: PaymentOutcomes): string {
  const parts: string[] = [];
  if (settled > 0) parts.push(`${plural(settled, 'payment')} went through.`);
  if (failed > 0) parts.push(`${plural(failed, 'payment')} did not go through. No money was taken.`);
  // Never answered: the phone cannot say whether money moved, so it says how to check instead of guessing.
  if (unconfirmed > 0) parts.push(`${plural(unconfirmed, 'payment')} could not be confirmed. Check your balance before sending again.`);
  return parts.join(' ');
}

/**
 * Home's notice for offline payments that were decided since the last visit. Without it the only way to learn that a
 * payment failed is to open History; the person who paid is told once, and can go straight to the details.
 */
export function OutcomeNotice({
  outcomes,
  onView,
  onDismiss,
}: {
  outcomes: PaymentOutcomes;
  onView: () => void;
  onDismiss: () => void;
}) {
  if (outcomes.settled === 0 && outcomes.failed === 0 && outcomes.unconfirmed === 0) return null;
  const failed = outcomes.failed > 0 || outcomes.unconfirmed > 0;
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={[styles.card, failed ? styles.cardFailed : styles.cardSettled]}
    >
      <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">
        {outcomeMessage(outcomes)}
      </Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onView}>
          <Text style={styles.view}>View</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={onDismiss}>
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 342,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  cardSettled: { borderColor: colors.primarySoft },
  cardFailed: { borderColor: colors.coral },
  message: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  view: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  dismiss: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
