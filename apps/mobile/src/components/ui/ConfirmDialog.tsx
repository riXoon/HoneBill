import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { Mascot, type MascotMood } from '../mascot/Mascot';
import { Button } from './Button';

type ConfirmDialogProps = {
  visible: boolean;
  mood: MascotMood;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Also runs for the Android back button. Tapping the dimmed backdrop does not dismiss: this is a question to answer. */
  onCancel: () => void;
};

/** Frosted card on a dimmed backdrop: Honi, a question, and a yes/no pair of buttons. */
export function ConfirmDialog({ visible, mood, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Mascot mood={mood} width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.copy}>{message}</Text>
          </View>
          <View style={styles.actions}>
            <Button label={confirmLabel} size="large" onPress={onConfirm} />
            <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
          </View>
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
  actions: { width: '100%', gap: 4 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontFamily: fonts.medium, fontSize: 14, color: colors.primary },
  pressed: { opacity: 0.7 },
});
