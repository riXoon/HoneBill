import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { useT } from '../../i18n';
import { colors, fonts } from '../../theme';
import { Mascot } from '../mascot/Mascot';
import { Button } from './Button';

/** Seconds the button stays locked, so the message is actually read. */
const READ_SECONDS = 10;

type RecoveryPhraseDialogProps = {
  visible: boolean;
  onDismiss: () => void;
};

/** Frosted card on a dimmed backdrop, with Honi's alert pose, telling the user to protect the recovery phrase. */
export function RecoveryPhraseDialog({ visible, onDismiss }: RecoveryPhraseDialogProps) {
  const t = useT();
  const [left, setLeft] = useState(READ_SECONDS);

  // Counts down each time the dialog opens; the interval is cleared when it closes or unmounts.
  useEffect(() => {
    if (!visible) return;
    setLeft(READ_SECONDS);
    const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {
        if (left === 0) onDismiss();
      }}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Mascot mood="alert" width={150} />
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {t.recovery.dialogTitle}
            </Text>
            <Text style={styles.copy}>{t.recovery.dialogWhy}</Text>
            <Text style={styles.copy}>{t.recovery.dialogKeep}</Text>
          </View>
          <Button
            label={t.recovery.understand(left)}
            size="large"
            onPress={onDismiss}
            disabled={left > 0}
          />
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
