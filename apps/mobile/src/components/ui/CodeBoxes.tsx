import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius } from '../../theme';
import { fieldStateStyle, useFieldFocus } from './fieldState';

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
 * The code in `text`. Typing gives only digits; autofill or paste may give the whole message ("Your HoneBill
 * code is 123456. It expires in 5 minutes"), so prefer a run of exactly `length` digits over the first digits found.
 */
export function digitsFrom(text: string, length: number): string {
  const exact = text.match(new RegExp(`(?<!\\d)\\d{${length}}(?!\\d)`));
  return (exact ? exact[0] : text.replace(/\D/g, '')).slice(0, length);
}

/**
 * Figma OTPBoxes / PINBoxes (870:2994, 870:2971): boxes 48x60, 12 dp apart. A single hidden
 * TextInput receives the digits so the system keyboard, paste and autofill all work.
 */
export function CodeBoxes({ length, value, onChange, secure, autoFocus, accessibilityLabel }: CodeBoxesProps) {
  const inputRef = useRef<TextInput>(null);
  const { focused, onFocus, onBlur } = useFieldFocus();
  // The box the next digit goes into is the "selected" one.
  const active = Math.min(value.length, length - 1);
  // Six 48 dp boxes would overflow the 322 dp content column, so longer codes use slimmer boxes.
  const compact = length > 4;

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false} style={styles.wrap}>
      <View style={[styles.row, compact && styles.rowCompact]} pointerEvents="none">
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[styles.box, compact && styles.boxCompact, fieldStateStyle(focused && i === active, Boolean(value[i]))]}
          >
            <Text style={styles.digit}>{value[i] ? (secure ? '•' : value[i]) : ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(secure ? t.replace(/\D/g, '').slice(0, length) : digitsFrom(t, length))}
        keyboardType="number-pad"
        // A code (not a PIN) can arrive as a whole SMS text from autofill or paste, so it must not be cut to
        // `length` characters before digitsFrom can pick the code out of it.
        maxLength={secure ? length : undefined}
        // Android's autofill service and the iOS keyboard suggest the code from the incoming SMS.
        autoComplete={secure ? 'off' : 'sms-otp'}
        autoFocus={autoFocus}
        secureTextEntry={secure}
        caretHidden
        onFocus={onFocus}
        onBlur={onBlur}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCompact: { gap: 8 },
  boxCompact: { width: 42 },
  digit: { fontFamily: fonts.regular, fontSize: 20, color: colors.primary },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
});
