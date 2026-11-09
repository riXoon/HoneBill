import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import LottieView, { type LottieViewProps } from 'lottie-react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useReducedMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Honi poses from the designer's asset pack (`HONI MASCOT PNG` / `HONI MASCOT ANIMATED`), mirroring
// the Figma `Emotes` component set (653:706). `width` is the default render size in dp (it includes
// the soft shadow/glow bleed around the 323x196 component); `aspect` is the PNG's height / width.
type MoodDef = {
  source: number;
  width: number;
  aspect: number;
  fit?: 'cover' | 'contain';
  /** Designer's Lottie export. Replaces the PNG float; the PNG stays as the reduced-motion frame. */
  lottie?: LottieViewProps['source'];
};

// The Lottie canvas is 400x400 around the 323x196 component, so it's drawn larger than the PNG box
// and centered on it, which keeps every screen's layout unchanged.
const LOTTIE_CANVAS_SCALE = 400 / 323;

const MOODS = {
  wave: {
    source: require('../../../assets/mascot/honi-wave.png'),
    width: 347,
    aspect: 229 / 359,
    lottie: require('../../../assets/mascot/honi-wave.json'),
  },
  /** Login's idle pose, with sparkles. Not in the asset pack yet; kept from the earlier Figma export. */
  idle: { source: require('../../../assets/mascot/honi-idle.png'), width: 356, aspect: 721 / 1069 },
  /** The plain `honi idle` variant (no sparkles). */
  idlePlain: {
    source: require('../../../assets/mascot/honi-idle-plain.png'),
    width: 347,
    aspect: 229 / 355,
    lottie: require('../../../assets/mascot/honi-idle.json'),
  },
  phone: { source: require('../../../assets/mascot/honi-phone.png'), width: 347, aspect: 229 / 359 },
  success: { source: require('../../../assets/mascot/honi-success.png'), width: 347, aspect: 233 / 360 },
  secure: { source: require('../../../assets/mascot/honi-secure.png'), width: 347, aspect: 267 / 359 },
  /** Send 4 "Get help sending": Honi with the alert mark. */
  alert: { source: require('../../../assets/mascot/honi-alert.png'), width: 347, aspect: 259 / 359 },
  /** Transfer to Offline: Honi holding the offline-vault badge. */
  bill: { source: require('../../../assets/mascot/honi-bill.png'), width: 347, aspect: 233 / 359 },
  fail: { source: require('../../../assets/mascot/honi-fail.png'), width: 347, aspect: 228 / 360 },
  question: { source: require('../../../assets/mascot/honi-question.png'), width: 347, aspect: 237 / 359 },
  /** Receipt "Voucher ready illustration": the success pose cropped to the design's 180x128 box. */
  voucher: { source: require('../../../assets/mascot/honi-success.png'), width: 180, aspect: 128 / 180, fit: 'cover' },
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
  const { source, width: defaultWidth, aspect, fit = 'contain', lottie }: MoodDef = MOODS[mood];
  const w = width ?? defaultWidth;
  const offset = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const useLottie = lottie !== undefined && animated && !reduceMotion;

  useEffect(() => {
    if (!animated || useLottie) return;
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
  }, [animated, useLottie, offset]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      accessible={useLottie}
      accessibilityLabel={useLottie ? 'Honi, the HoneBill mascot' : undefined}
      style={[{ width: w, height: w * aspect }, style, animated && !useLottie && animatedStyle]}
    >
      {useLottie ? (
        <LottieView
          source={lottie}
          autoPlay
          loop
          resizeMode="contain"
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: '50%',
            width: w * LOTTIE_CANVAS_SCALE,
            height: w * LOTTIE_CANVAS_SCALE,
            marginTop: -(w * LOTTIE_CANVAS_SCALE) / 2,
          }}
        />
      ) : (
        <Image
          source={source}
          style={{ width: '100%', height: '100%' }}
          contentFit={fit}
          accessibilityLabel="Honi, the HoneBill mascot"
        />
      )}
    </Animated.View>
  );
}
