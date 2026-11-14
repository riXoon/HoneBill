import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

/** Figma mode pill under the title ("Receive via online"): a 10 dp status dot and a Light 12 label on a lavender tint. */
export function ModePill({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 42, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: colors.placeholderTint,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontFamily: fonts.light, fontSize: 14, color: colors.textMuted },
});
