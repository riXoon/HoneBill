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

/** Left-right arrows from Figma (small icons), used for money you sent. */
function SwapIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 23.7143 23.6667">
      <Path
        d="M19.7814 10.2165C19.8571 10.0337 19.8769 9.8326 19.8383 9.63857C19.7997 9.44455 19.7043 9.26634 19.5644 9.1265L14.5644 4.1265L13.1504 5.54049L16.4434 8.8335H3.85742V10.8335H18.8574C19.0552 10.8335 19.2485 10.775 19.413 10.6651C19.5775 10.5553 19.7057 10.3992 19.7814 10.2165ZM3.93342 13.4505C3.85771 13.6333 3.83792 13.8344 3.87655 14.0284C3.91517 14.2224 4.01048 14.4007 4.15042 14.5405L9.15042 19.5405L10.5644 18.1265L7.27142 14.8335H19.8574V12.8335H4.85742C4.65965 12.8334 4.46631 12.892 4.30184 13.0019C4.13737 13.1117 4.00916 13.2678 3.93342 13.4505Z"
        fill={colors.surface}
      />
    </Svg>
  );
}

export type ActivityRowProps = Omit<ActivityItem, 'id'> & {
  /** Money in (check mark, the default) or money out (arrows). */
  kind?: 'received' | 'sent';
};

/** One activity row (Figma Notifs > Content, 870:3119 on Home and 870:3133 on Inbox). */
export const ActivityRow = memo(function ActivityRow({ title, body, time, kind = 'received' }: ActivityRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>{kind === 'sent' ? <SwapIcon /> : <CheckIcon />}</View>
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
