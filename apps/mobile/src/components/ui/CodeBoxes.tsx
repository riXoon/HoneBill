import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius } from '../../theme';

type CodeBoxesProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Show a dot instead of the digit (PIN entry). */
  secure?: boolean;
  autoFocus?: boolean;
  accessibilityLabel: string;
};

/**
 * Figma OTPBoxes / PINBoxes (870:2994, 870:2971): boxes 48x60, 12 dp apart. A single hidden
 * TextInput receives the digits so the system keyboard, paste and autofill all work.
 */
export function CodeBoxes({ length, value, onChange, secure, autoFocus, accessibilityLabel }: CodeBoxesProps) {
  const inputRef = useRef<TextInput>(null);
  // Six 48 dp boxes would overflow the 322 dp content column, so longer codes use slimmer boxes.
  const compact = length > 4;

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false} style={styles.wrap}>
      <View style={[styles.row, compact && styles.rowCompact]} pointerEvents="none">
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.box, compact && styles.boxCompact]}>
            <Text style={styles.digit}>{value[i] ? (secure ? '•' : value[i]) : ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        secureTextEntry={secure}
        caretHidden
        textContentType={secure ? 'password' : 'oneTimeCode'}
        accessibilityLabel={accessibilityLabel}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  box: {
    width: 48,
    height: 60,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTranslucent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCompact: { gap: 8 },
  boxCompact: { width: 42 },
  digit: { fontFamily: fonts.regular, fontSize: 20, color: colors.primary },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
});
