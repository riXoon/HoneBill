import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MPIN_LENGTH } from '../../config/limits';
import { colors, fonts } from '../../theme';
import { CodeBoxes } from './CodeBoxes';
import { messages } from '../../i18n';

type PinDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  /** Checks the PIN. Resolve with an error message to keep the dialog open, or null once it is accepted (the caller closes it). */
  onSubmit: (pin: string) => Promise<string | null>;
  onCancel: () => void;
};

/** Asks for the MPIN before something sensitive. Submits by itself on the fourth digit. */
export function PinDialog({ visible, title, message, onSubmit, onCancel }: PinDialogProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounting the boxes after a wrong PIN brings the keyboard back.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const change = (value: string) => {
    setPin(value);
    if (value.length !== MPIN_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    onSubmit(value)
      .then((failure) => {
        if (failure) {
          setError(failure);
          setPin('');
          setAttempt((n) => n + 1);
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.copy}>{message}</Text>
          </View>
          <CodeBoxes key={attempt} length={MPIN_LENGTH} value={pin} onChange={change} secure autoFocus accessibilityLabel={messages().pinDialog.a11y} />
          <Text
            style={[styles.status, error ? styles.error : null]}
            accessibilityLiveRegion="polite"
            accessibilityRole={error ? 'alert' : undefined}
          >
            {busy ? messages().common.checking : (error ?? ' ')}
          </Text>
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.cancel}>{messages().common.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 120,
    paddingHorizontal: 30,
    backgroundColor: 'rgba(34, 32, 33, 0.5)',
  },
  card: {
    width: '100%',
    padding: 20,
    gap: 16,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  message: { gap: 6, alignItems: 'center' },
  heading: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.light, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.coral },
  cancel: { fontFamily: fonts.medium, fontSize: 15, color: colors.primary },
  pressed: { opacity: 0.7 },
});
