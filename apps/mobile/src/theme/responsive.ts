import { useWindowDimensions } from 'react-native';

/** The Figma frames are 402 x 874 dp. */
const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
/** Below this the art would be too small to read, so the screens scroll or clip instead of shrinking further. */
const MIN_SCALE = 0.6;

/**
 * How much to shrink design-sized art (mascots, hero images) on this phone: 1 on a phone as big as the design,
 * less on a narrower or shorter one, never more (a tablet or a large phone does not blow the art up).
 */
export function useScale(): number {
  const { width, height } = useWindowDimensions();
  return Math.max(MIN_SCALE, Math.min(1, width / DESIGN_WIDTH, height / DESIGN_HEIGHT));
}

/** Same idea for width only: cards and columns that need to fit the screen's width, not its height. */
export function useWidthScale(): number {
  const { width } = useWindowDimensions();
  return Math.max(MIN_SCALE, Math.min(1, width / DESIGN_WIDTH));
}
