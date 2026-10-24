import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '../../theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  /** `large` is the 16 dp / SemiBold button used on the form screens; `default` is the landing button. */
  size?: 'default' | 'large';
  /** Optional icon shown after the label. */
  icon?: ReactNode;
};

export function Button({ label, onPress, variant = 'primary', size = 'default', icon }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const large = size === 'large';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { paddingVertical: large ? 16 : 14 },
        isPrimary ? styles.primary : styles.outline,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: isPrimary ? colors.surface : colors.primary, fontFamily: large ? fonts.semibold : fonts.medium },
        ]}
      >
        {label}
      </Text>
      {icon ? <View>{icon}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pressed: { opacity: 0.85 },
  label: { fontSize: 15, textAlign: 'center' },
});
