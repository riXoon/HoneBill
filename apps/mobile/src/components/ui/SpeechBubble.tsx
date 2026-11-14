import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { colors, fonts } from '../../theme';

type SpeechBubbleProps = {
  message: string;
  isError?: boolean;
  /** Wait this long before popping in, so Honi appears first and then speaks. */
  delay?: number;
};

/**
 * A speech bubble whose tail points down at Honi, who sits just below it. It pops out of its tail (scales up
 * with a small overshoot while fading in) and pops again every time its screen comes into focus (tabs stay mounted) or the message changes. Skipped when the phone's
 * "reduce motion" setting is on.
 */
export function SpeechBubble({ message, isError = false, delay = 0 }: SpeechBubbleProps) {
  const reduceMotion = useReducedMotion();
  // The tabs stay mounted when you leave them, so a mount-only animation would play once per app launch.
  const focused = useIsFocused();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const prev = useRef<{ message: string; focused: boolean } | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    // Reset while the screen is hidden, then pop again every time it comes back into view.
    // The delay is for appearing (mount, or coming back to the screen). A new line while the bubble is already
    // up (Honi's loading chatter) pops straight away.
    const swapped = prev.current !== null && prev.current.focused === focused && prev.current.message !== message;
    prev.current = { message, focused };
    progress.value = 0;
    if (focused) progress.value = withDelay(swapped ? 0 : delay, withSpring(1, { damping: 11, stiffness: 190, mass: 0.7 }));
  }, [message, delay, reduceMotion, focused, progress]);

  const popStyle = useAnimatedStyle(() => ({
    // Opacity settles faster than the spring so the overshoot does not flicker.
    opacity: Math.min(1, progress.value * 2.5),
    transform: [{ scale: 0.3 + 0.7 * progress.value }, { translateY: (1 - progress.value) * 8 }],
  }));

  return (
    <Animated.View
      style={[styles.wrap, popStyle]}
      accessible
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLabel={`Honi says: ${message}`}
    >
      <View style={styles.bubble}>
        <Text style={[styles.text, isError && styles.error]}>{message}</Text>
        {/* A rotated square with only its lower two edges bordered: the bubble's tail. Drawn last so it covers the bubble's bottom edge. */}
        <View style={styles.tail} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Room under the bubble for the tail, which hangs below its box. The pivot is the bottom centre (the tail tip).
  wrap: { alignItems: 'center', paddingBottom: 9, transformOrigin: '50% 100%' },
  bubble: {
    maxWidth: 240,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text, textAlign: 'center' },
  error: { color: colors.coral },
  tail: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.primarySoft,
    transform: [{ rotate: '45deg' }],
  },
});
