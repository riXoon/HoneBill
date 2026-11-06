import { StyleSheet, Text, TextInput } from 'react-native';

import { splitPesos } from '../../utils/format';
import { colors, fonts } from '../../theme';
import { OutlinedField } from './OutlinedField';

const MAX_WHOLE_DIGITS = 9;
// Lexend at 32 dp: a digit is ~19.6 dp wide and a dot ~6.5 dp. The field is sized to its text so the
// "PHP" label and the amount stay centred together, as in the design.
const DIGIT_WIDTH = 19.6;
const DOT_WIDTH = 6.5;

/** Digits and a single dot, at most two decimals. */
export function sanitizeAmount(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned.slice(0, MAX_WHOLE_DIGITS);
  return `${cleaned.slice(0, dot).slice(0, MAX_WHOLE_DIGITS)}.${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

/**
 * Why `amount` cannot be used yet, or null when it can. `available` is the most the wallet can spend; leave it
 * out when nothing caps the amount (a payment request). There is no transfer limit: the backend sets none.
 */
export function amountProblem(amount: number, available?: number): string | null {
  if (amount <= 0) return 'Enter Amount';
  if (available !== undefined && amount > available) return 'Not enough balance';
  return null;
}

function fieldWidth(text: string): number {
  const shown = text || '0.00';
  const dots = shown.split('.').length - 1;
  return Math.ceil((shown.length - dots) * DIGIT_WIDTH + dots * DOT_WIDTH) + 4;
}

type AmountFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Currency tag before the number. */
  currency?: string;
};

/** Figma amount "input": the "PHP" tag and a 32 dp number, centred together. Formats to 1,000.00 on blur. */
export function AmountField({ value, onChangeText, currency = 'PHP' }: AmountFieldProps) {
  const formatOnBlur = () => {
    const amount = Number(value) || 0;
    if (amount <= 0) return;
    const { whole, cents } = splitPesos(amount);
    onChangeText(`${whole}.${cents}`);
  };

  return (
    <OutlinedField style={styles.field}>
      <Text style={styles.currency}>{currency}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(sanitizeAmount(t))}
        onBlur={formatOnBlur}
        placeholder="0.00"
        placeholderTextColor="rgba(34, 32, 33, 0.2)"
        keyboardType="decimal-pad"
        accessibilityLabel={`Amount in ${currency === 'PHP' ? 'pesos' : currency}`}
        style={[styles.input, { width: fieldWidth(value) }]}
      />
    </OutlinedField>
  );
}

const styles = StyleSheet.create({
  field: { justifyContent: 'center', gap: 17 },
  currency: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  input: { padding: 0, fontFamily: fonts.regular, fontSize: 32, color: colors.text, textAlign: 'center' },
});
