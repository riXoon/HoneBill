import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

/** Coloured initials disc (Figma "Frame", 40 dp, Bold 12). `ring` adds the 6 dp page-coloured border used on Send 2. */
export function Avatar({ initials, color, ring = false }: { initials: string; color: string; ring?: boolean }) {
  return (
    <View style={[styles.disc, { backgroundColor: color }, ring && styles.ring]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.text}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 6, borderColor: colors.background },
  text: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
});
