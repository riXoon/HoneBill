import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { Button } from '../components/ui/Button';
import { APP_VERSION } from '../config/appVersion';
import { checkForUpdate } from '../services/appUpdates';
import { colors, fonts } from '../theme';
import { messages, useT } from '../i18n';

/**
 * Shown instead of the whole app when this version is older than the backend's minimum (APP_MIN_SUPPORTED_VERSION).
 * It cannot be dismissed: an old app could make payments the backend no longer accepts. The wallet itself is not
 * touched; installing the new APK over this one keeps it.
 */
export function UpdateRequiredScreen({ minimumVersion, downloadUrl }: { minimumVersion: string; downloadUrl: string | null }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);

  const download = () => {
    if (!downloadUrl) return;
    void Linking.openURL(downloadUrl).catch(() => Alert.alert(messages().common.openDownloadFailed, downloadUrl));
  };

  // After the backend lowers its minimum (or a mistake is fixed), this lets the app back in without a restart.
  const checkAgain = async () => {
    setChecking(true);
    try {
      await checkForUpdate({ force: true });
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: Math.max(24, insets.bottom) + 16 }]}>
        <Mascot mood="alert" width={220} />
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            {t.update.title}
          </Text>
          <Text style={styles.body}>
            {t.update.unsupported(APP_VERSION, minimumVersion)}
          </Text>
          <Text style={styles.body}>
            {t.update.safe}
          </Text>
          {downloadUrl ? null : (
            <Text style={styles.body}>{t.update.askSupport}</Text>
          )}
        </View>
        <View style={styles.actions}>
          {downloadUrl ? <Button label={t.update.download} size="large" onPress={download} /> : null}
          <Button
            label={checking ? t.common.checking : t.update.checkAgain}
            variant="outline"
            onPress={() => void checkAgain()}
            disabled={checking}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 28 },
  text: { width: '100%', maxWidth: 340, gap: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center' },
  actions: { width: '100%', maxWidth: 302, gap: 12 },
});
