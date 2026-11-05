import { memo, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../../theme';
import { buildHiveGrid, hexPolygon, type HexCell } from './hiveGrid';

/**
 * "Entering the hive": a honeycomb wall covers the screen, its cells open outward from the centre onto a glowing
 * interior, and the camera flies through the opening.
 *
 * Cheap by construction: about 25 to 50 hexagon tiles (one small vector each), drawn once, and only `transform`
 * and `opacity` change, all on the UI thread. No masks, no per-frame redraws, no images. Colours are the brand
 * palette. Mount it only when the transition starts, and drive it with a 0 -> 1 `progress` value.
 */
const HEX_RADIUS = 96;
/** Gap left between neighbouring tiles so the glow behind shows through. */
const HEX_INSET = 4;
const ZOOM = 3.6;

// Timeline, as fractions of `progress`.
const WALL_IN_END = 0.2; // the wall materialises over the page
const OPEN_FROM = 0.22; // the centre cell starts opening...
const OPEN_SPREAD = 0.3; // ...and the outermost one starts this much later
const OPEN_SPAN = 0.26; // each cell takes this long to open
const ZOOM_FROM = 0.3; // the camera starts moving through
const SETTLE_FROM = 0.84; // the light settles to the page colour

const TONE_FILL = [colors.yellow, colors.primarySoft, colors.primary] as const;

/** 0 before `from`, 1 after `to`, linear between. */
function segment(value: number, from: number, to: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}
function easeInOutCubic(t: number): number {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t: number): number {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number): number {
  'worklet';
  return t * t * t;
}

type TileProps = { cell: HexCell; progress: SharedValue<number>; polygon: ReturnType<typeof hexPolygon> };

const Tile = memo(function Tile({ cell, progress, polygon }: TileProps) {
  const openAt = OPEN_FROM + cell.distance * OPEN_SPREAD;
  const style = useAnimatedStyle(() => {
    const appear = easeOutCubic(segment(progress.value, 0, WALL_IN_END));
    const open = easeInOutCubic(segment(progress.value, openAt, openAt + OPEN_SPAN));
    return {
      opacity: appear,
      // Pops in slightly small, then shrinks to nothing while turning: the cell "opens".
      transform: [{ scale: (0.7 + 0.3 * appear) * (1 - open) }, { rotate: `${open * 60}deg` }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.tile, { left: cell.x - polygon.width / 2, top: cell.y - HEX_RADIUS, width: polygon.width, height: polygon.height }, style]}
    >
      <Svg width={polygon.width} height={polygon.height}>
        <Polygon
          points={polygon.points}
          fill={TONE_FILL[cell.tone]}
          stroke={colors.primary}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
});

export function HiveEntrance({ progress }: { progress: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const cells = useMemo(() => buildHiveGrid(width, height, HEX_RADIUS), [width, height]);
  const polygon = useMemo(() => hexPolygon(HEX_RADIUS, HEX_INSET), []);

  // The whole wall and the light behind it move toward the viewer together, so the opened cells fly past the edges.
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (ZOOM - 1) * easeInCubic(segment(progress.value, ZOOM_FROM, 1)) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: easeOutCubic(segment(progress.value, 0, WALL_IN_END)) }));
  // Ends on the page colour, so Home can fade in from it without a flash.
  const settleStyle = useAnimatedStyle(() => ({ opacity: segment(progress.value, SETTLE_FROM, 1) }));

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
        {/* The hive's interior: bright at the centre, deepening to honey at the edges. */}
        <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <Svg width={width} height={height}>
            <Defs>
              <RadialGradient id="hiveGlow" cx="50%" cy="50%" r="72%">
                <Stop offset="0" stopColor={colors.yellow} />
                <Stop offset="0.5" stopColor={colors.primarySoft} />
                <Stop offset="1" stopColor={colors.primary} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#hiveGlow)" />
          </Svg>
        </Animated.View>

        {cells.map((cell) => (
          <Tile key={cell.key} cell={cell} progress={progress} polygon={polygon} />
        ))}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, styles.settle, settleStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'absolute' },
  settle: { backgroundColor: colors.background },
});
