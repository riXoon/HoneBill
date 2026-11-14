import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

/** Figma "bar": a caption over a 4 dp track, green for `ratio` (0-1) and grey for the rest. */
export function BalanceBar({ caption, ratio }: { caption: string; ratio: number }) {
  const filled = Math.min(1, Math.max(0, ratio));
  return (
    <View style={styles.bar}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.track}>
        <View style={[styles.filled, { width: `${filled * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: 6 },
  caption: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted },
  track: { height: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.track },
  filled: { height: 4, backgroundColor: colors.success },
});
