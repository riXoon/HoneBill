import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../../theme';
import { AppBackground } from '../ui/AppBackground';
import { ProcessingOverlay, type Processing } from '../ui/ProcessingOverlay';
import { ChevronLeftIcon } from '../ui/smallIcons';

type SendLayoutProps = {
  title: string;
  /** Glyph after the title (24 dp). */
  icon: ReactNode;
  onBack: () => void;
  /** Gap between the sections: 20 on Send 1/4, 12 on Send 2/3 and the receipt (Figma "body" vs "content"). */
  gap?: number;
  /** Pinned to the bottom of the screen, below a flexible spacer: the swipe button. */
  footer?: ReactNode;
  /** Centre the body between the top bar and the footer instead of stacking it under the top bar (the receipt). */
  centered?: boolean;
  /**
   * For screens that run a transaction: while not `null`, a full-screen loading view covers the screen and the user
   * cannot go back (Android Back, iOS swipe) until it finishes.
   */
  processing?: Processing | null;
  children: ReactNode;
};

/**
 * Shell shared by the Send screens: brand background, the 64 dp top bar (back button, title, icon),
 * 30 dp side gutters and an optional footer pinned at the bottom. Scrolls when the content (or the
 * keyboard) leaves no room, so small phones can still reach everything.
 */
export function SendLayout({ title, icon, onBack, gap = 20, footer, centered = false, processing, children }: SendLayoutProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { gap, paddingTop: Math.max(70, insets.top + 24), paddingBottom: Math.max(70, insets.bottom + 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack} style={styles.back}>
            <ChevronLeftIcon />
          </Pressable>
          <View style={styles.title}>
            <Text style={styles.titleText} accessibilityRole="header">
              {title}
            </Text>
            {icon}
          </View>
        </View>

        {centered ? <View style={styles.spacer} /> : null}

        {children}

        {footer ? (
          <>
            <View style={styles.spacer} />
            <View style={styles.footer}>{footer}</View>
          </>
        ) : null}
      </ScrollView>
      {/* Only screens that run a transaction pass `processing`; they get the loading view and the back lock. */}
      {processing !== undefined ? <ProcessingOverlay processing={processing} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 30 },
  // Figma "Top Bar": 342x64, 10 dp padding, 44 dp round back button.
  topBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(247, 247, 251, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  spacer: { flex: 1 },
  footer: { alignItems: 'center' },
});
