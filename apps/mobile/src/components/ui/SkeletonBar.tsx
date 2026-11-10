import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** A placeholder block that breathes (opacity only, so it runs on the UI thread). Static when "reduce motion" is on. */
export function SkeletonBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.35 + 0.4 * pulse.value }));
  return <Animated.View style={[styles.bar, style, animated]} />;
}

const styles = StyleSheet.create({
  // White on the card's orange/red fill reads as a frosted placeholder in both card colours.
  bar: { backgroundColor: 'rgba(255, 255, 255, 0.55)', borderRadius: 8 },
});
