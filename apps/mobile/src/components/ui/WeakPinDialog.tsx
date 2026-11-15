import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../../i18n';
import { colors, fonts } from '../../theme';
import type { WeakMpinReason } from '../../services/mpinPolicy';
import { Mascot } from '../mascot/Mascot';
import { Button } from './Button';

type WeakPinDialogProps = {
  /** Why the PIN was rejected; null hides the dialog. */
  reason: WeakMpinReason | null;
  onDismiss: () => void;
};

/** Frosted card on a dimmed backdrop, with Honi's alert pose, asking the user to pick a harder PIN. */
export function WeakPinDialog({ reason, onDismiss }: WeakPinDialogProps) {
  const t = useT();
  return (
    <Modal visible={reason !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={t.common.dismiss} />
        <View style={styles.card} accessibilityViewIsModal>
          <Mascot mood="alert" width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {t.weakPin.title}
            </Text>
            <Text style={styles.copy}>{reason ? t.weakPin[reason] : ''}</Text>
            <Text style={styles.copy}>{t.weakPin.advice}</Text>
          </View>
          <Button label={t.weakPin.button} size="large" onPress={onDismiss} />
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
