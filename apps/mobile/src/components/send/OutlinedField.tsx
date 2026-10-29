import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors } from '../../theme';

/** Figma "input": 1 dp orange outline, 12 dp radius, 20% white fill, 12 dp padding, 42 dp tall. */
export function OutlinedField({
  children,
  invalid = false,
  style,
}: {
  children: ReactNode;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.field, invalid && styles.invalid, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  field: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(247, 247, 251, 0.2)',
  },
  invalid: { borderColor: colors.coral },
});
