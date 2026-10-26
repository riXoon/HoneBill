import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '../../theme';

type KeypadProps = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
};

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

/** Backspace glyph from Figma (delete, 870:3100). */
function DeleteIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M12 8.99966L15.0003 12M15.0003 12L18.0005 15.0003M15.0003 12L18.0005 8.99966M15.0003 12L12 15.0003M9.99981 4.9992C9.50285 4.99923 9.02369 5.18426 8.6557 5.51826L2.32717 11.2589C2.22388 11.3527 2.14134 11.467 2.08486 11.5945C2.02838 11.7221 1.9992 11.86 1.9992 11.9995C1.9992 12.139 2.02838 12.2769 2.08486 12.4045C2.14134 12.532 2.22388 12.6463 2.32717 12.7401L8.6557 18.4817C9.02369 18.8157 9.50285 19.0008 9.99981 19.0008H20.0006C20.5311 19.0008 21.0399 18.7901 21.415 18.4149C21.7901 18.0398 22.0008 17.5311 22.0008 17.0006V6.99943C22.0008 6.46893 21.7901 5.96017 21.415 5.58505C21.0399 5.20994 20.5311 4.9992 20.0006 4.9992H9.99981Z"
        stroke={colors.text}
        strokeOpacity={0.5}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

type KeyProps = { label?: string; onPress?: () => void; children?: React.ReactNode };

function Key({ label, onPress, children }: KeyProps) {
  if (!onPress) return <View style={styles.cell} />;
  return (
    <Pressable
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children ?? <Text style={styles.digit}>{label}</Text>}
    </Pressable>
  );
}

/** Numeric MPIN keypad (Figma Numbers, 870:3073): 4 rows of 80 dp, three equal columns, full width. */
export const Keypad = memo(function Keypad({ onDigit, onDelete }: KeypadProps) {
  return (
    <View style={styles.pad}>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => onDigit(d)} />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <Key />
        <Key label="0" onPress={() => onDigit('0')} />
        <Key label="Delete" onPress={onDelete}>
          <DeleteIcon />
        </Key>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { width: '100%' },
  row: { height: 80, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.4 },
  digit: { fontFamily: fonts.light, fontSize: 22, color: colors.text },
});
