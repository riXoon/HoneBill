import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, radius } from '../../theme';

type TextFieldProps = Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Shown under the field when set. */
  error?: string;
};

/** Alert glyph (Figma Alert, 12x12). */
function AlertIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path
        d="M6 0C2.68661 0 0 2.68661 0 6C0 9.31339 2.68661 12 6 12C9.31339 12 12 9.31339 12 6C12 2.68661 9.31339 0 6 0ZM6 10.9821C3.24911 10.9821 1.01786 8.75089 1.01786 6C1.01786 3.24911 3.24911 1.01786 6 1.01786C8.75089 1.01786 10.9821 3.24911 10.9821 6C10.9821 8.75089 8.75089 10.9821 6 10.9821Z"
        fill={colors.coral}
      />
      <Path
        d="M5.4375 3.9375C5.4375 4.08668 5.49676 4.22976 5.60225 4.33525C5.70774 4.44074 5.85082 4.5 6 4.5C6.14918 4.5 6.29226 4.44074 6.39775 4.33525C6.50324 4.22976 6.5625 4.08668 6.5625 3.9375C6.5625 3.78832 6.50324 3.64524 6.39775 3.53975C6.29226 3.43426 6.14918 3.375 6 3.375C5.85082 3.375 5.70774 3.43426 5.60225 3.53975C5.49676 3.64524 5.4375 3.78832 5.4375 3.9375ZM6.28125 5.25H5.71875C5.66719 5.25 5.625 5.29219 5.625 5.34375V8.53125C5.625 8.58281 5.66719 8.625 5.71875 8.625H6.28125C6.33281 8.625 6.375 8.58281 6.375 8.53125V5.34375C6.375 5.29219 6.33281 5.25 6.28125 5.25Z"
        fill={colors.coral}
      />
    </Svg>
  );
}

/** Labelled input (Figma Input, 870:3017). Focused fields turn solid with a soft shadow. */
export function TextField({ label, value, onChangeText, error, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={[styles.field, focused ? styles.fieldFocused : styles.fieldIdle]}
      />
      {/* Always reserve the row so the layout does not jump when an error appears. */}
      <View style={[styles.alert, !error && styles.alertHidden]} accessibilityLiveRegion="polite">
        <AlertIcon />
        <Text style={styles.alertText}>{error ?? ' '}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 302, gap: 8 },
  label: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  field: {
    height: 50,
    paddingHorizontal: 20,
    borderRadius: radius.field,
    borderWidth: 1,
    fontFamily: fonts.light,
    fontSize: 12,
    color: colors.text,
  },
  fieldFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  fieldIdle: { backgroundColor: colors.surfaceTranslucent, borderColor: colors.primarySoft },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 12 },
  alertHidden: { opacity: 0 },
  alertText: { fontFamily: fonts.regular, fontSize: 10, color: colors.coral },
});
