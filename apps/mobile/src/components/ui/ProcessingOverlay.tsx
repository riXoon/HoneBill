import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBlockBack } from '../../hooks/useBlockBack';
import { colors, fonts } from '../../theme';
import { Mascot } from '../mascot/Mascot';

export type Processing = {
  /** What is happening, e.g. "Sending your payment". */
  title: string;
  /** The current step, when the flow has several (e.g. "Adding funds…"). */
  step?: string;
};

const FADE_MS = 200;

/**
 * Full-screen loading view while a transaction runs. It covers the whole screen (so nothing, including the on-screen
 * back button, can be tapped) and blocks Android Back and iOS swipe-back until the transaction finishes or fails.
 * Render it last in the screen so it sits on top.
 */
export function ProcessingOverlay({ processing }: { processing: Processing | null }) {
  const insets = useSafeAreaInsets();
  useBlockBack(processing !== null);
  if (!processing) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      <Mascot mood="phone" width={260} />
      <ActivityIndicator size="large" color={colors.primary} />
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {processing.title}
        </Text>
        {processing.step ? <Text style={styles.step}>{processing.step}</Text> : null}
        <Text style={styles.hint}>Please keep the app open. This can take up to a minute.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 40,
    backgroundColor: colors.background,
  },
  text: { alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, textAlign: 'center' },
  step: { fontFamily: fonts.medium, fontSize: 13, color: colors.primary, textAlign: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
});
