import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBlockBack } from '../../hooks/useBlockBack';
import { holdLock } from '../../services/lockHold';
import { colors, fonts } from '../../theme';
import { Mascot } from '../mascot/Mascot';
import { messages } from '../../i18n';

export type Processing = {
  /** What is happening, e.g. "Sending your payment". */
  title: string;
  /** The current step, when the flow has several (e.g. "Adding funds…"). */
  step?: string;
  /** Replaces the default "keep the app open, up to a minute" line, for quick work like signing in. */
  hint?: string;
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
  // Work in flight holds off the auto-lock, so leaving the app cannot cut a payment short.
  const working = processing !== null;
  useEffect(() => (working ? holdLock() : undefined), [working]);
  if (!processing) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      {/* The screen behind stays visible, blurred (iOS) or under a frosted veil (Android), so people see where they are. */}
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.wash} pointerEvents="none" />
      <Mascot mood="phone" width={260} />
      <ActivityIndicator size="large" color={colors.primary} />
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {processing.title}
        </Text>
        {processing.step ? <Text style={styles.step}>{processing.step}</Text> : null}
        <Text style={styles.hint}>{processing.hint ?? messages().common.keepOpen}</Text>
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
  },
  // The brand background tinted over the blur, so the text stays readable. Heavier on Android, which has no live blur here.
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Platform.OS === 'android' ? 'rgba(236, 240, 243, 0.82)' : 'rgba(236, 240, 243, 0.45)',
  },
  text: { alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, textAlign: 'center' },
  step: { fontFamily: fonts.medium, fontSize: 15, color: colors.primary, textAlign: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
});
