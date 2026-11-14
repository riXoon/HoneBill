import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

/** Figma "Title/Date" (870:3177): a 2 dp rule at 20% black, then the day, right-aligned. */
export const DateDivider = memo(function DateDivider({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label} numberOfLines={1} accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { width: '100%', height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  line: { flex: 1, height: 2, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  // Figma pads the label 16 x 10 inside a 30 dp row; that makes the text view taller than the row, which
  // Android can clip. A 15 dp line height centred in the row gives the same position without the overflow.
  label: {
    flexShrink: 0,
    paddingHorizontal: 16,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 17,
    includeFontPadding: false,
    color: colors.text,
    textAlign: 'center',
  },
});
