import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme';

type PinDotsProps = {
  length: number;
  /** How many digits have been entered. */
  filled: number;
};

/** Figma PinDots (870:3067): r=6 dots, 28 dp apart, #222021 at 50%. Filled state is not in the design; shown at full opacity. */
export function PinDots({ length, filled }: PinDotsProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
    >
      {Array.from({ length }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled && styles.dotFilled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text, opacity: 0.5 },
  dotFilled: { opacity: 1 },
});
