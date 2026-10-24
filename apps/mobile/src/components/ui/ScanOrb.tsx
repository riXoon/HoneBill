import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../../theme';
import { ScanGlyph } from './navIcons';

// Figma "Load" ring + "Scan" disc (Nav 123:938, also on QR Scan 882:2893): a 69 dp touch area, a
// 55.69 dp disc with the scan glyph, and a 77 dp orange arc that overflows it.
export const SCAN_ORB_SIZE = 69;

type ScanOrbProps = {
  /** Circulate the orange arc. On by default; pass false for a static ring. */
  spinning?: boolean;
};

export function ScanOrb({ spinning = true }: ScanOrbProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 2200, easing: Easing.linear }),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
    return () => cancelAnimation(rotation);
  }, [spinning, rotation]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={[styles.ring, ringStyle]}>
        <Svg width={77} height={77} viewBox="0 2 77 77">
          <Defs>
            {/* Figma "D Loading fade": transparent peach to primary orange. */}
            <LinearGradient id="arc" gradientUnits="userSpaceOnUse" x1={73} y1={40.5} x2={4} y2={40.5}>
              <Stop offset={0} stopColor="#FED9AF" stopOpacity={0} />
              <Stop offset={0.399} stopColor={colors.primary} />
            </LinearGradient>
          </Defs>
          <Circle cx={38.5} cy={40.5} r={34.5} stroke={colors.surface} strokeOpacity={0.5} strokeWidth={4} fill="none" />
          <Path
            d="M73 40.5C73 33.6766 70.9766 27.0063 67.1857 21.3328C63.3948 15.6593 58.0066 11.2374 51.7026 8.62617C45.3985 6.01495 38.4617 5.33173 31.7694 6.66292C25.0771 7.99411 18.9297 11.2799 14.1048 16.1048C9.27992 20.9297 5.99411 27.0771 4.66292 33.7694C3.33173 40.4617 4.01495 47.3985 6.62617 53.7026C9.2374 60.0066 13.6593 65.3948 19.3328 69.1857C25.0063 72.9766 31.6766 75 38.5 75"
            stroke="url(#arc)"
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
      <View style={styles.disc}>
        <ScanGlyph color={colors.text} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: SCAN_ORB_SIZE, height: SCAN_ORB_SIZE },
  // The ring's centre sits at y=40.5 in Figma's 77 dp box; the viewBox is shifted by 2 so the centre is
  // the view's centre and the arc rotates without wobbling. top is -4 (was -6) to compensate.
  ring: { position: 'absolute', top: -4, left: -4, width: 77, height: 77 },
  disc: {
    position: 'absolute',
    top: 7.15,
    left: 6.16,
    width: 55.69,
    height: 55.69,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
