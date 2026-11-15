import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { PaymentOutcomes } from '../../context/WalletDataContext';
import { messages, useT } from '../../i18n';
import { colors, fonts } from '../../theme';
import { Notice, type NoticeTone } from '../ui/Notice';

const FADE_MS = 250;

/** What happened to offline payments since the user last looked, e.g. "1 offline payment did not go through…". */
export function outcomeMessage({ settled, failed, unconfirmed }: PaymentOutcomes): string {
  const t = messages().outcomes;
  const parts: string[] = [];
  if (settled > 0) parts.push(t.settled(settled));
  if (failed > 0) parts.push(t.failed(failed));
  // Never answered: the phone cannot say whether money moved, so it says how to check instead of guessing.
  if (unconfirmed > 0) parts.push(t.unconfirmed(unconfirmed));
  return parts.join(' ');
}

/** The most serious outcome sets the look: a failure is an error, an unconfirmed payment a warning, else information. */
function toneOf({ failed, unconfirmed }: PaymentOutcomes): { tone: NoticeTone; title: string } {
  const t = messages().outcomes;
  if (failed > 0) return { tone: 'error', title: t.failedTitle(failed) };
  if (unconfirmed > 0) return { tone: 'warning', title: t.checkTitle(unconfirmed) };
  return { tone: 'info', title: t.updatedTitle };
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
  const t = useT();
  if (outcomes.settled === 0 && outcomes.failed === 0 && outcomes.unconfirmed === 0) return null;
  const { tone, title } = toneOf(outcomes);
  return (
    <Animated.View entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.wrap}>
      <Notice
        tone={tone}
        title={title}
        action={
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.common.dismiss} hitSlop={8} onPress={onDismiss}>
              <Text style={styles.dismiss}>{t.common.dismiss}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.outcomes.viewA11y} hitSlop={8} onPress={onView}>
              <Text style={styles.view}>{t.outcomes.view}</Text>
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
  view: { fontFamily: fonts.semibold, fontSize: 15, color: colors.primary },
  dismiss: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
});
