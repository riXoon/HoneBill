import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../../theme';

type StepDiamondProps = { step: 1 | 2 | 3 | 4 };

// Figma "progress" (870:3040 / 3009 / 3024 / 2987): an orange diamond whose unfinished edges are
// painted over in light orange. Step 4 is complete, so it has no overlay.
const DIAMOND = 'M24.7426 4.24264L45.2426 24.7426L24.7426 45.2426L4.24264 24.7426L24.7426 4.24264Z';
const REMAINING: Record<StepDiamondProps['step'], string | null> = {
  1: 'M49.4844 24.7422L24.7422 49.4844L0.491211 25.2334H8.97559L24.7422 41L41 24.7422L25.2334 8.97559V0.491211L49.4844 24.7422ZM0.233398 24.9756L0 24.7422L0.233398 24.5088V24.9756ZM24.9756 0.233398H24.5088L24.7422 0L24.9756 0.233398Z',
  2: 'M24.7422 49.4844L24.5068 49.249H24.9775L24.7422 49.4844ZM49.4844 24.7422L25.2422 48.9844V40.5L41 24.7422L25.2422 8.98438V0.5L49.4844 24.7422ZM0.242188 24.9844L0 24.7422L0.242188 24.5V24.9844ZM24.9912 0.249023H24.4932L24.7422 0L24.9912 0.249023Z',
  3: 'M24.7422 49.4844L24.5068 49.249H24.9775L24.7422 49.4844ZM0.242188 24.9844L0 24.7422L0.242188 24.5V24.9844ZM49.4844 24.7422L49.4775 24.749H40.9932L41 24.7422L25.2422 8.98438V0.5L49.4844 24.7422ZM24.9912 0.249023H24.4932L24.7422 0L24.9912 0.249023Z',
  4: null,
};

/** Registration progress indicator shown top-right on the sign-up screens. */
export function StepDiamond({ step }: StepDiamondProps) {
  const remaining = REMAINING[step];
  return (
    <Svg width={49} height={49} viewBox="0 0 49.4844 49.4844" accessibilityLabel={`Step ${step} of 4`}>
      <Path d={DIAMOND} stroke={colors.primary} strokeWidth={6} fill="none" />
      {remaining ? <Path d={remaining} fill={colors.primarySoft} /> : null}
    </Svg>
  );
}

/** Chevron from the Figma icon sprite; every sprite icon is centred on (11.86, 144.83). */
function ChevronLeft() {
  return (
    <Svg width={24} height={24} viewBox="-0.14 132.83 24 24">
      <Path
        d="M14.8217 150.75L8.89316 144.833L14.8217 138.917"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

type AuthChromeProps = {
  onBack: () => void;
  /** Omit outside the sign-up flow (e.g. finding an existing account to sign in). */
  step?: StepDiamondProps['step'];
};

/** Back button (left) and step diamond (right), pinned over the top of a sign-up screen. */
export function AuthChrome({ onBack, step }: AuthChromeProps) {
  const insets = useSafeAreaInsets();
  const top = Math.max(32, insets.top + 8);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={[styles.back, { top }]}
      >
        <ChevronLeft />
      </Pressable>
      {step ? (
        <View pointerEvents="none" style={[styles.step, { top }]}>
          <StepDiamond step={step} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    left: 32,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247, 247, 251, 0.2)',
  },
  step: { position: 'absolute', right: 25 },
});
