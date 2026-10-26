import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import type { WeakMpinReason } from '../../services/mpinPolicy';
import { Mascot } from '../mascot/Mascot';
import { Button } from './Button';

const DETAIL: Record<WeakMpinReason, string> = {
  repeated: 'Four of the same digit, like 1111 or 2222, is one of the first things anyone tries.',
  sequence: 'Digits in a row, like 1234 or 4321, are among the most common PINs and easy to guess.',
  common: 'That combination is one of the most commonly used PINs, so it is easy to guess.',
};

type WeakPinDialogProps = {
  /** Why the PIN was rejected; null hides the dialog. */
  reason: WeakMpinReason | null;
  onDismiss: () => void;
};

/** Frosted card on a dimmed backdrop, with Honi's alert pose, asking the user to pick a harder PIN. */
export function WeakPinDialog({ reason, onDismiss }: WeakPinDialogProps) {
  return (
    <Modal visible={reason !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.card} accessibilityViewIsModal>
          <Mascot mood="alert" width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              PIN not allowed
            </Text>
            <Text style={styles.copy}>{reason ? DETAIL[reason] : ''}</Text>
            <Text style={styles.copy}>
              For your security, please create another PIN that is hard to guess and that only you know.
            </Text>
          </View>
          <Button label="Create another PIN" size="large" onPress={onDismiss} />
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
  copy: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
});
