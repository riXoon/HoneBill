import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

type Props = {
  shortId: string;
  /** Caption above the ID. */
  label?: string;
  /** Inline pill ("Short ID  ABC123") for tight spots like the Home header. */
  compact?: boolean;
};

/** The short ID is what a sender types or scans to pay someone, so it is shown large, spaced and high-contrast. */
export function ShortIdBadge({ shortId, label = 'SHORT ID', compact = false }: Props) {
  if (compact) {
    return (
      <View style={styles.pill} accessible accessibilityLabel={`Short ID: ${shortId.split('').join(' ')}`}>
        <Text style={styles.pillLabel}>Short ID</Text>
        <Text style={styles.pillValue} selectable numberOfLines={1}>
          {shortId}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.box} accessible accessibilityLabel={`${label}: ${shortId.split('').join(' ')}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable numberOfLines={1} adjustsFontSizeToFit>
        {shortId}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.yellow,
  },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.yellow,
  },
  pillLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  pillValue: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 2, color: colors.text },
  label: { fontFamily: fonts.regular, fontSize: 10, letterSpacing: 1, color: colors.textMuted },
  value: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: 3, color: colors.text, textAlign: 'center' },
});
