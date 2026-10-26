import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Honi poses exported from the Figma `Emotes` component set (653:706). Add the other moods
// (fail, alert, question, bill) here as their pages need them. `width` is the exported image's
// size in dp (it includes the soft shadow/glow bleed around the 323x196 component).
type MoodDef = { source: number; width: number; aspect: number; fit?: 'cover' | 'contain' };

const MOODS = {
  wave: { source: require('../../../assets/mascot/honi-wave.png'), width: 347, aspect: 740 / 1041 },
  /** Login's idle pose, with sparkles. */
  idle: { source: require('../../../assets/mascot/honi-idle.png'), width: 356, aspect: 721 / 1069 },
  /** The plain `honi idle` variant (no sparkles). */
  idlePlain: { source: require('../../../assets/mascot/honi-idle-plain.png'), width: 347, aspect: 680 / 1041 },
  phone: { source: require('../../../assets/mascot/honi-phone.png'), width: 347, aspect: 680 / 1041 },
  success: { source: require('../../../assets/mascot/honi-success.png'), width: 347, aspect: 680 / 1041 },
  secure: { source: require('../../../assets/mascot/honi-secure.png'), width: 347, aspect: 769 / 1041 },
  /** Send 4 "Get help sending": Honi with the alert mark. */
  alert: { source: require('../../../assets/mascot/honi-alert.png'), width: 347, aspect: 471 / 694 },
  /** Transfer to Offline: Honi holding the offline-vault badge. */
  bill: { source: require('../../../assets/mascot/honi-bill.png'), width: 347, aspect: 453 / 694 },
  /** Receipt "Voucher ready illustration": Honi with a green check. Cropped to the design's 180x128 box. */
  voucher: { source: require('../../../assets/mascot/honi-voucher.png'), width: 180, aspect: 128 / 180, fit: 'cover' },
} satisfies Record<string, MoodDef>;

export type MascotMood = keyof typeof MOODS;

type MascotProps = {
  mood: MascotMood;
  /** Override the rendered width in dp; height follows the image's aspect ratio. */
  width?: number;
  /** Turn the idle float off (e.g. for a static reflection). Defaults to on. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

const FLOAT_DISTANCE = 6;
const FLOAT_HALF_CYCLE_MS = 1400;

/**
 * Honi with a gentle idle float. Placeholder motion: the real timing/easing must come from the
 * designer's prototype (not readable through the Figma MCP). Only transform is animated, and the
 * loop is skipped when the OS "reduce motion" setting is on.
 */
export function Mascot({ mood, width, animated = true, style }: MascotProps) {
  const { source, width: defaultWidth, aspect, fit = 'contain' }: MoodDef = MOODS[mood];
  const w = width ?? defaultWidth;
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    offset.value = withRepeat(
      withSequence(
        withTiming(-FLOAT_DISTANCE, { duration: FLOAT_HALF_CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: FLOAT_HALF_CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [animated, offset]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ width: w, height: w * aspect }, style, animated && animatedStyle]}
    >
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        contentFit={fit}
        accessibilityLabel="Honi, the HoneBill mascot"
      />
    </Animated.View>
  );
}
