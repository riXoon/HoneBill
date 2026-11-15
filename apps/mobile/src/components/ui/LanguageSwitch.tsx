import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { LANGUAGES, setLanguage, useLanguage, useT } from '../../i18n';
import { colors, fonts, radius } from '../../theme';

type LanguageSwitchProps = {
  /** The small pill for the corner of the Landing and sign-in screens; the full-width one is for settings. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * English / Filipino, applied at once and kept on this phone. Each option is written in its own language, so someone
 * who cannot read the current one still finds theirs.
 */
export function LanguageSwitch({ compact = false, style }: LanguageSwitchProps) {
  const language = useLanguage();
  const t = useT();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t.language.title} style={[styles.track, compact && styles.trackCompact, style]}>
      {LANGUAGES.map(({ code, label }) => {
        const selected = code === language;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={label}
            hitSlop={compact ? 6 : 0}
            onPress={() => setLanguage(code)}
            style={({ pressed }) => [
              styles.option,
              compact && styles.optionCompact,
              selected && styles.optionSelected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text
              style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surfaceTranslucent,
  },
  trackCompact: { padding: 3, gap: 2 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill },
  optionCompact: { flex: 0, minHeight: 32, paddingHorizontal: 12 },
  optionSelected: { backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  labelCompact: { fontSize: 13 },
  labelSelected: { color: colors.surface },
});
