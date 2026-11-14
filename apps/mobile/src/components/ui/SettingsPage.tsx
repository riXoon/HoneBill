import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../../theme';
import { AppBackground } from './AppBackground';
import { AuthChrome } from './AuthChrome';
import { GradientTitle } from './GradientTitle';

type SettingsPageProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
};

/** Shell for the screens opened from the Profile menu: back button, gradient title, scrolling body that clears the keyboard. */
export function SettingsPage({ title, subtitle, onBack, children }: SettingsPageProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AppBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(100, insets.top + 68), paddingBottom: Math.max(24, insets.bottom) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <GradientTitle>{title}</GradientTitle>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {/* After the ScrollView, so it is drawn (and tapped) on top: the scroll area covers the whole screen. */}
      <AuthChrome onBack={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 40, gap: 24 },
  header: { gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 15, color: colors.textMuted },
});
