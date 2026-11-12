import { Modal, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { Mascot, type MascotMood } from '../mascot/Mascot';
import { Button } from './Button';

export type ResultDialogProps = {
  visible: boolean;
  /** Honi's pose: `success` for a good result, `fail` for a bad one. */
  mood: MascotMood;
  title: string;
  message: string;
  buttonLabel?: string;
  /** The button and the Android back button. The backdrop does not dismiss: this is an outcome to acknowledge. */
  onDismiss: () => void;
};

/** Frosted card on a dimmed backdrop: Honi reacting to the outcome, what happened, and one button. */
export function ResultDialog({ visible, mood, title, message, buttonLabel = 'Done', onDismiss }: ResultDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityLiveRegion="polite">
          <Mascot mood={mood} width={170} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.copy}>{message}</Text>
          </View>
          <Button label={buttonLabel} size="large" onPress={onDismiss} />
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
  message: { gap: 8, alignItems: 'center' },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
