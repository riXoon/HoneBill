import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

type FilterChipsProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
};

// Figma "Sort" (739:2328): the "Filter" label then pill chips. Active chip is solid primary with a
// white hairline; inactive chips are translucent with a 50% outline and a soft shadow (the design's
// backdrop blur and inner highlight are not reproduced).
function FilterChipsBase<T extends string>({ options, value, onChange }: FilterChipsProps<T>) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      <View style={styles.label}>
        <Text style={styles.labelText}>Filter</Text>
      </View>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => onChange(option)}
            style={[styles.chip, selected ? styles.chipActive : styles.chipIdle]}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextActive : styles.chipTextIdle]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const FilterChips = memo(FilterChipsBase) as typeof FilterChipsBase;

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { minWidth: 60, paddingHorizontal: 18, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  labelText: { fontFamily: fonts.regular, fontSize: 10, color: colors.text, textAlign: 'center' },
  chip: {
    minWidth: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.surface },
  chipIdle: {
    backgroundColor: colors.surfaceTranslucent,
    borderColor: colors.textMuted,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  chipText: { fontFamily: fonts.regular, fontSize: 10, textAlign: 'center' },
  chipTextActive: { color: colors.surface },
  chipTextIdle: { color: colors.textMuted },
});
