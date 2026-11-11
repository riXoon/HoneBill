import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme';
import { Mascot } from '../mascot/Mascot';
import { Button } from './Button';

type ComingSoonDialogProps = {
  /** What is not available yet, e.g. "Maya"; null hides the dialog. */
  feature: string | null;
  onDismiss: () => void;
};

/** Frosted card on a dimmed backdrop, with Honi's question pose, for a rail that is not open yet. */
export function ComingSoonDialog({ feature, onDismiss }: ComingSoonDialogProps) {
  return (
    <Modal visible={feature !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.card} accessibilityViewIsModal>
          <Mascot mood="question" width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              Not available yet
            </Text>
            <Text style={styles.copy}>{feature} is not available for now. We are working on it, so please check back soon.</Text>
            <Text style={styles.copy}>In the meantime, you can send with HoneBill.</Text>
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
  copy: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
});
