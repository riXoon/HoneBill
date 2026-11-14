import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { PaymentOutcomes } from '../../context/WalletDataContext';
import { colors, fonts } from '../../theme';
import { Notice, type NoticeTone } from '../ui/Notice';

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

/** The most serious outcome sets the look: a failure is an error, an unconfirmed payment a warning, else information. */
function toneOf({ failed, unconfirmed }: PaymentOutcomes): { tone: NoticeTone; title: string } {
  if (failed > 0) return { tone: 'error', title: failed === 1 ? 'A payment did not go through' : 'Payments did not go through' };
  if (unconfirmed > 0) return { tone: 'warning', title: unconfirmed === 1 ? 'A payment needs checking' : 'Payments need checking' };
  return { tone: 'info', title: 'Offline payments updated' };
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
  const { tone, title } = toneOf(outcomes);
  return (
    <Animated.View entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.wrap}>
      <Notice
        tone={tone}
        title={title}
        action={
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={onDismiss}>
              <Text style={styles.dismiss}>Dismiss</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="View in History" hitSlop={8} onPress={onView}>
              <Text style={styles.view}>View</Text>
            </Pressable>
          </View>
        }
      >
        {outcomeMessage(outcomes)}
      </Notice>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 342 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 },
  view: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  dismiss: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
