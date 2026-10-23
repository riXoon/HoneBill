import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

import { colors, fonts } from '../../theme';
import { HistoryIcon, HomeIcon, InboxIcon, ProfileIcon } from './navIcons';
import type { NavIconProps } from './navIcons';
import { ScanOrb } from './ScanOrb';

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
  const dotX = useSharedValue(TABS.find((t) => t.key === active)!.left + DOT_OFFSET);

  // The indicator dot slides from the previous tab to the newly selected one.
  useEffect(() => {
    dotX.value = withTiming(TABS.find((t) => t.key === active)!.left + DOT_OFFSET, DOT_TIMING);
  }, [active, dotX]);

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
          <ScanOrb spinning={spinning} />
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
});
