import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { Mascot, type MascotMood } from '../mascot/Mascot';
import { Button } from './Button';

/**
 * `offline`: the user reached for something that needs the internet (the Online balance, moving money between
 * balances) while the phone is offline.
 * `restored`: the connection came back, so those features work again.
 */
export type ConnectivityNotice = 'offline' | 'restored';

const CONTENT: Record<ConnectivityNotice, { mood: MascotMood; title: string; lines: string[] }> = {
  offline: {
    mood: 'alert',
    title: "You're offline",
    lines: [
      'Online features, like your Online Balance and moving money between your balances, are unavailable until your internet connection returns.',
      'You can still pay and receive with your Offline Balance.',
    ],
  },
  restored: {
    mood: 'success',
    title: "You're back online",
    lines: [
      'Online features are available again, and your balances and transactions are being updated.',
      'Tap your balance cards to switch to your Online Balance.',
    ],
  },
};

type ConnectivityNoticeDialogProps = {
  /** Which notice to show; `null` hides the dialog. */
  notice: ConnectivityNotice | null;
  onDismiss: () => void;
};

/** Same frosted card as the other notices: Honi, a heading, a short explanation and "Got it". */
export function ConnectivityNoticeDialog({ notice, onDismiss }: ConnectivityNoticeDialogProps) {
  // Keep the last content while the fade-out runs, so the card does not go blank as it closes.
  const content = CONTENT[notice ?? 'offline'];
  return (
    <Modal visible={notice !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.card} accessibilityViewIsModal accessibilityLiveRegion="polite">
          <Mascot mood={content.mood} width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {content.title}
            </Text>
            {content.lines.map((line) => (
              <Text key={line} style={styles.copy}>
                {line}
              </Text>
            ))}
          </View>
          <Button label="Got it" size="large" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: 'rgba(34, 32, 33, 0.5)' },
  card: {
    width: '100%',
    padding: 20,
    gap: 16,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  message: { width: '100%', gap: 8 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
});
