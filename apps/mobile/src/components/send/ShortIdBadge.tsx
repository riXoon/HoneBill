import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { colors, fonts } from '../../theme';
import { useT } from '../../i18n';

type Props = {
  shortId: string;
  /** Caption above the ID. */
  label?: string;
  /** Inline pill ("Short ID  ABC123") for tight spots like the Home header. */
  compact?: boolean;
};

/** The short ID is what a sender types or scans to pay someone, so it is shown large, spaced and high-contrast. Tap to copy. */
export function ShortIdBadge({ shortId, label = 'SHORT ID', compact = false }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(shortId);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
    AccessibilityInfo.announceForAccessibility(t.shortId.copiedAnnounce);
  };

  const spoken = shortId.split('').join(' ');

  if (compact) {
    return (
      <Pressable
        onPress={() => void copy()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Short ID: ${spoken}`}
        accessibilityHint={t.shortId.hint}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        <Text style={[styles.pillLabel, copied && styles.copied]}>{copied ? t.common.copied : 'Short ID'}</Text>
        <Text style={styles.pillValue} numberOfLines={1}>
          {shortId}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => void copy()}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${spoken}`}
      accessibilityHint={t.shortId.hint}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      <Text style={[styles.label, copied && styles.copied]}>{copied ? t.common.copied.toUpperCase() : label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {shortId}
      </Text>
    </Pressable>
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
  pressed: { opacity: 0.7 },
  copied: { color: colors.borderRed },
  pillLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  pillValue: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: 2, color: colors.text },
  label: { fontFamily: fonts.regular, fontSize: 12, letterSpacing: 1, color: colors.textMuted },
  value: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: 3, color: colors.text, textAlign: 'center' },
});
