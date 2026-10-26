/** Why a PIN is too easy to guess, or null when it is acceptable. */
export type WeakMpinReason = 'repeated' | 'sequence' | 'common';

// Frequently chosen 4-digit PINs that the other rules do not already catch (keypad column, dates, pairs).
const COMMON = new Set(['1212', '2121', '1122', '2580', '0852', '1004', '2000', '2001', '6969', '1010', '0101', '1313', '2323']);

export function weakMpinReason(pin: string): WeakMpinReason | null {
  if (!/^\d+$/.test(pin) || pin.length < 2) return null;
  const digits = [...pin].map(Number);

  if (digits.every((d) => d === digits[0])) return 'repeated';

  // Steps of +1 or -1 between neighbours, wrapping 9 -> 0 (1234, 4321, 7890, 9012).
  const steps = digits.slice(1).map((d, i) => (d - digits[i] + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return 'sequence';

  return COMMON.has(pin) ? 'common' : null;
}
