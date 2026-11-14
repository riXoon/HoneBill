import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '../../theme';
import { InfoIcon } from './smallIcons';

/**
 * How serious a message is, so it reads at a glance:
 *  - `warning`: the user should double-check before going on (soft yellow box, orange mark);
 *  - `info`:    something useful to know, nothing wrong (plain box, muted mark);
 *  - `error`:   something failed (coral border and mark).
 * Colors are the brand palette and named Figma variables only (theme/index.ts).
 */
export type NoticeTone = 'warning' | 'info' | 'error';

const TONE: Record<NoticeTone, { box: ViewStyle; icon: string; title: string }> = {
  warning: { box: { backgroundColor: colors.yellow, borderColor: colors.primarySoft }, icon: colors.primary, title: colors.text },
  info: { box: { backgroundColor: colors.surface, borderColor: colors.primarySoft }, icon: colors.textMuted, title: colors.text },
  error: { box: { backgroundColor: colors.surface, borderColor: colors.coral }, icon: colors.coral, title: colors.coral },
};

type NoticeProps = {
  tone: NoticeTone;
  /** A short bold line, e.g. "Check this ID first". Optional for one-line notices. */
  title?: string;
  /** The message itself, in full sentences. */
  children: ReactNode;
  /** Buttons or links under the message. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** A boxed message with an icon, so warnings and errors stand out from the screen's normal text. */
export function Notice({ tone, title, children, action, style }: NoticeProps) {
  const t = TONE[tone];
  return (
    <View
      style={[styles.box, t.box, style]}
      // Warnings and errors are announced as they appear; information is read in place.
      accessibilityRole={tone === 'info' ? undefined : 'alert'}
      accessibilityLiveRegion={tone === 'info' ? 'none' : 'polite'}
    >
      <View style={styles.row}>
        <InfoIcon color={t.icon} size={20} />
        <View style={styles.text}>
          {title ? <Text style={[styles.title, { color: t.title }]}>{title}</Text> : null}
          <Text style={styles.body}>{children}</Text>
        </View>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.text },
  action: { width: '100%' },
});
