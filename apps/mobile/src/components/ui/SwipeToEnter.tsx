import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts } from '../../theme';

type SwipeToEnterProps = {
  onComplete: () => void;
  label?: string;
};

const WIDTH = 325;
const HEIGHT = 80;
const PADDING = 10;
const KNOB = 60;
const MAX_X = WIDTH - PADDING * 2 - KNOB;
/** Release past this fraction of the track to confirm. */
const COMPLETE_AT = 0.7;

/** Knob from Figma (slide, 60x60): white disc with a double chevron. */
function Knob() {
  return (
    <Svg width={KNOB} height={KNOB} viewBox="0 0 60 60">
      <Circle cx={30} cy={30} r={30} fill={colors.surface} />
      <Path
        d="M30.3312 29.6922L26.3421 24.5953C26.2952 24.5344 26.2218 24.5 26.1452 24.5H24.9374C24.8327 24.5 24.7749 24.6203 24.839 24.7016L28.9859 30L24.839 35.2984C24.8246 35.3169 24.8156 35.339 24.8132 35.3622C24.8107 35.3855 24.8149 35.409 24.8251 35.43C24.8354 35.4511 24.8514 35.4688 24.8712 35.4811C24.8911 35.4935 24.914 35.5001 24.9374 35.5H26.1452C26.2218 35.5 26.2952 35.4641 26.3421 35.4047L30.3312 30.3094C30.4734 30.1266 30.4734 29.8734 30.3312 29.6922ZM35.0812 29.6922L31.0921 24.5953C31.0452 24.5344 30.9718 24.5 30.8952 24.5H29.6874C29.5827 24.5 29.5249 24.6203 29.589 24.7016L33.7359 30L29.589 35.2984C29.5746 35.3169 29.5656 35.339 29.5632 35.3622C29.5607 35.3855 29.5649 35.409 29.5751 35.43C29.5854 35.4511 29.6014 35.4688 29.6212 35.4811C29.6411 35.4935 29.664 35.5001 29.6874 35.5H30.8952C30.9718 35.5 31.0452 35.4641 31.0921 35.4047L35.0812 30.3094C35.2234 30.1266 35.2234 29.8734 35.0812 29.6922Z"
        fill="#B03D00"
      />
    </Svg>
  );
}

/** Figma Swipe (870:2964): a 325x80 gradient track with a draggable knob. Only `transform` animates. */
export function SwipeToEnter({ onComplete, label = 'SWIPE TO  ENTER' }: SwipeToEnterProps) {
  const x = useSharedValue(0);
  const startX = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = x.value;
    })
    .onUpdate((e) => {
      x.value = Math.min(MAX_X, Math.max(0, startX.value + e.translationX));
    })
    .onEnd(() => {
      if (x.value >= MAX_X * COMPLETE_AT) {
        x.value = withSpring(MAX_X);
        scheduleOnRN(onComplete);
      } else {
        x.value = withSpring(0);
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // Trail: a full-width pill whose right edge rides on the knob's centre. It only translates, and
  // fades in over the first stretch of the drag so nothing shows while the knob rests.
  const trailStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, MAX_X * 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: x.value + PADDING + KNOB / 2 - WIDTH }],
  }));

  // The hint text fades out as the knob covers it.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, MAX_X * 0.5], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View
      style={styles.shadow}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Swipe to enter"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onComplete}
    >
      <LinearGradient
        colors={[colors.primarySoft, colors.coral]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.track}
      >
        <Animated.View pointerEvents="none" style={[styles.trail, trailStyle]} />
        {/* Label before the knob so the knob draws over it. */}
        <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
        <GestureDetector gesture={pan}>
          <Animated.View style={knobStyle}>
            <Knob />
          </Animated.View>
        </GestureDetector>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: 100,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  track: {
    flex: 1,
    borderRadius: 100,
    padding: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  trail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: WIDTH,
    borderRadius: 100,
    // "L20 low opacity" white from the Figma variables.
    backgroundColor: 'rgba(247, 247, 251, 0.35)',
  },
  // The label sits behind the knob's start position and is centred in the remaining track.
  label: {
    position: 'absolute',
    left: PADDING + KNOB,
    right: PADDING,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 6,
    color: colors.surface,
  },
});
