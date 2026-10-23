import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, fonts } from '../../theme';
import { HistoryIcon, HomeIcon, InboxIcon, ProfileIcon, ScanGlyph } from './navIcons';
import type { NavIconProps } from './navIcons';

// Figma: Nav (123:958). The bar is 362x80 with a round notch for the scan button, which is a 69 dp
// disc ringed by a "Load" arc. The whole component is 362x114 and floats above the screen bottom.
export type NavTabKey = 'Home' | 'Inbox' | 'History' | 'Profile';

const TABS: { key: NavTabKey; label: string; left: number; Icon: ComponentType<NavIconProps> }[] = [
  { key: 'Home', label: 'Home', left: 21, Icon: HomeIcon },
  { key: 'Inbox', label: 'Inbox', left: 81, Icon: InboxIcon },
  { key: 'History', label: 'History', left: 233, Icon: HistoryIcon },
  { key: 'Profile', label: 'Profile', left: 293, Icon: ProfileIcon },
];

/** Total height of the floating bar (excluding the bottom margin); screens use it as bottom padding. */
export const NAV_BAR_HEIGHT = 114;
const BAR_WIDTH = 362;
const BAR_BOTTOM_GAP = 24;

const BAR_SHAPE =
  'M322 0C344.091 0 362 17.9087 362 40C362 62.0913 344.091 80 322 80H40C17.9087 80 0 62.0913 0 40C2.87136e-06 17.9087 17.9087 0 40 0H111C124.255 0 134.496 11.4434 141.113 22.9288C149.056 36.7175 163.944 46 181 46C198.056 46 212.944 36.7175 220.887 22.9288C227.504 11.4434 237.745 0 251 0H322Z';

/** The indicator slides with a short ease-out, no overshoot, so rapid tab changes stay calm. */
const DOT_TIMING = { duration: 180, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System } as const;
/** Dot centre offset inside a 48 dp tab, minus half the 5 dp dot. */
const DOT_OFFSET = 24 - 2.5;

type TabButtonProps = {
  Icon: ComponentType<NavIconProps>;
  label: string;
  left: number;
  selected: boolean;
  onPress: () => void;
};

/** One tab. The selected tab is tinted coral (Figma "D red" on the Home screens); the sliding dot marks it. */
function TabButton({ Icon, label, left, selected, onPress }: TabButtonProps) {
  const tint = selected ? colors.coral : colors.text;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, { left }]}
    >
      <Icon color={tint} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

type BottomNavBarProps = {
  active: NavTabKey;
  onTabPress: (key: NavTabKey) => void;
  onScanPress: () => void;
  /** Circulate the orange arc around the scan button. On by default; pass false for a static ring. */
  spinning?: boolean;
};

/** Floating bottom navigation with a centre scan button. Place it absolutely over the tab screens. */
export function BottomNavBar({ active, onTabPress, onScanPress, spinning = true }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  const rotation = useSharedValue(0);
  const dotX = useSharedValue(TABS.find((t) => t.key === active)!.left + DOT_OFFSET);

  // The indicator dot slides from the previous tab to the newly selected one.
  useEffect(() => {
    dotX.value = withTiming(TABS.find((t) => t.key === active)!.left + DOT_OFFSET, DOT_TIMING);
  }, [active, dotX]);

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
  }, [spinning, rotation]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dotX.value }] }));

  return (
    <View style={[styles.root, { paddingBottom: Math.max(BAR_BOTTOM_GAP, insets.bottom) }]} pointerEvents="box-none">
      <View style={styles.group}>
        {/* Bar: the orange 4 dp edge is the design's hard shadow, drawn as an offset copy of the shape. */}
        <Svg width={BAR_WIDTH} height={84} viewBox="0 0 362 84" style={styles.bar} pointerEvents="none">
          <G y={4}>
            <Path d={BAR_SHAPE} fill={colors.primary} />
          </G>
          <Path d={BAR_SHAPE} fill={colors.surface} />
        </Svg>

        <View style={styles.buttons} accessibilityRole="tablist">
          {TABS.map(({ key, label, left, Icon }) => (
            <TabButton
              key={key}
              Icon={Icon}
              label={label}
              left={left}
              selected={key === active}
              onPress={() => onTabPress(key)}
            />
          ))}
          <Animated.View pointerEvents="none" style={[styles.dot, dotStyle]} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          onPress={onScanPress}
          style={({ pressed }) => [styles.scan, pressed && styles.scanPressed]}
        >
          <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none">
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
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  group: { width: BAR_WIDTH, height: NAV_BAR_HEIGHT },
  bar: { position: 'absolute', top: 34, left: 0 },
  buttons: { position: 'absolute', top: 34 + 13, left: 0, width: BAR_WIDTH, height: 50 },
  tab: { position: 'absolute', top: 0, width: 48, height: 50, alignItems: 'center', gap: 6 },
  dot: { position: 'absolute', top: 54, left: 0, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.coral },
  label: { width: 48, textAlign: 'center', fontFamily: fonts.regular, fontSize: 10 },
  // 69 dp touch area; the ring (77 dp) overflows it as in Figma.
  scan: { position: 'absolute', top: 0, left: 145, width: 69, height: 69 },
  scanPressed: { opacity: 0.85 },
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
