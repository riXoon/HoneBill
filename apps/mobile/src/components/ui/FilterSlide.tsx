import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

// Horizontal slide for list content when a filter chip changes, in the direction of the chip order
// (a chip to the right brings the rows in from the right), like the tab pages. Transform and opacity
// only, one shared value for every row, so it stays on the UI thread.
const SLIDE_DISTANCE = 80;
const SLIDE_MS = 260;

const SlideContext = createContext<SharedValue<number> | null>(null);

/** Returns the shared offset to hand to <FilterSlideProvider>. Pass the selected chip's index. */
export function useFilterSlide(index: number) {
  const offset = useSharedValue(0);
  const previous = useRef(index);

  useEffect(() => {
    if (previous.current === index) return;
    const direction = index > previous.current ? 1 : -1;
    previous.current = index;
    offset.value = direction * SLIDE_DISTANCE;
    offset.value = withTiming(0, {
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [index, offset]);

  return offset;
}

export function FilterSlideProvider({ offset, children }: { offset: SharedValue<number>; children: ReactNode }) {
  return <SlideContext.Provider value={offset}>{children}</SlideContext.Provider>;
}

/** Wrap each list row (and the empty state) in this so it follows the filter slide. */
export function SlideRow({ children }: { children: ReactNode }) {
  const offset = useContext(SlideContext);
  const style = useAnimatedStyle(() => {
    const x = offset ? offset.value : 0;
    return { opacity: 1 - Math.min(Math.abs(x) / SLIDE_DISTANCE, 1), transform: [{ translateX: x }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}
