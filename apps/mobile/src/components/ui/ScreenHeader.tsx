import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';

type ScreenHeaderProps = {
  /** Coral line icon, 40 dp (Figma "Top bar Main", 739:1422). */
  icon: ReactNode;
  title: string;
  /** Optional control pinned to the right edge (e.g. Profile's logout). */
  trailing?: ReactNode;
};

/** Tab screen title row: icon, uppercase 20 dp title. 342 dp wide, 40 dp tall. */
export function ScreenHeader({ icon, title, trailing }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      {icon}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', height: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.regular, fontSize: 20, color: colors.text, textTransform: 'uppercase' },
  trailing: { marginLeft: 'auto' },
});
