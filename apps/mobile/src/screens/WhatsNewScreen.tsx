import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SettingsPage } from '../components/ui/SettingsPage';
import { APP_VERSION_LABEL } from '../config/appVersion';
import { RELEASE_NOTES } from '../content/releaseNotes';
import type { RootStackParamList } from '../navigation/types';
import { markUpdateRead } from '../services/appUpdates';
import { colors, fonts, radius } from '../theme';
import { useT } from '../i18n';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

/** Every release's notes, newest first. Opened from an Inbox update notice (`version` is highlighted) or from Profile. */
export function WhatsNewScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'WhatsNew'>) {
  const t = useT();
  const highlighted = route.params?.version;

  // Reading the notes counts as reading the Inbox notice for them.
  useEffect(() => {
    if (highlighted) void markUpdateRead(`release-${highlighted}`);
  }, [highlighted]);

  return (
    <SettingsPage title={t.profile.whatsNew} subtitle={t.whatsNew.onVersion(APP_VERSION_LABEL)} onBack={navigation.goBack}>
      {RELEASE_NOTES.map((note) => (
        <View key={note.version} style={[styles.card, note.version === highlighted && styles.cardHighlighted]}>
          <View style={styles.head}>
            <Text style={styles.version}>Version {note.version}</Text>
            <Text style={styles.date}>{longDate(note.date)}</Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {note.title}
          </Text>
          {note.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading} accessibilityRole="header">
                {section.heading}
              </Text>
              <View style={styles.items}>
                {section.items.map((item) => (
                  <View key={item} style={styles.item}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: 10,
    padding: 18,
    borderRadius: radius.field,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.card,
  },
  cardHighlighted: { borderColor: colors.primarySoft },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  version: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  date: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  title: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  section: { gap: 8, marginTop: 6 },
  heading: { fontFamily: fonts.semibold, fontSize: 15, color: colors.coral },
  items: { gap: 8 },
  item: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.primary },
  itemText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
});
