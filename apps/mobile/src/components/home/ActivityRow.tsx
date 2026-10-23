import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { ActivityItem } from '../../mocks/home';
import { colors, fonts } from '../../theme';

/** Check mark from Figma (small icons, 23.7 dp). */
function CheckIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 23.7143 23.6667">
      <Path
        d="M3.85765 11.8336L9.85765 17.8336L19.8577 5.83362"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** One Recent Activity row (Figma Notifs > Content, 870:3119). */
export const ActivityRow = memo(function ActivityRow({ title, body, time }: Omit<ActivityItem, 'id'>) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <CheckIcon />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.body} numberOfLines={1}>
          {body}
        </Text>
      </View>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(247, 247, 251, 0.5)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 2,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2, justifyContent: 'center', padding: 10 },
  title: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  body: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  time: { fontFamily: fonts.light, fontSize: 10, color: colors.textMuted, textAlign: 'right' },
});
