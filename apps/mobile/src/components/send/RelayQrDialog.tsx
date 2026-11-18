import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useT } from '../../i18n';
import { colors, fonts } from '../../theme';
import { formatPeso } from '../../utils/format';
import { Button } from '../ui/Button';

const QR_SIZE = 220;

type Props = {
  visible: boolean;
  /** The QR's text: `SMSTO:<gateway>:<voucher>` (see `relayQrPayload`), so any camera opens a ready-to-send text. */
  value: string | null;
  amount: number;
  recipientLabel: string;
  /** "My partner sent it": record the payment as pending and show the receipt. */
  onDone: () => void;
  /** Also runs for the Android back button. */
  onClose: () => void;
};

/**
 * "Get Help Sending": the sender's signed voucher as a QR for a partner with text load to scan, with HoneBill or any
 * phone camera. Either opens their messaging app with the voucher typed in, addressed to the gateway. The voucher is
 * signed, so the partner cannot change the recipient or the amount.
 */
export function RelayQrDialog({ visible, value, amount, recipientLabel, onDone, onClose }: Props) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={styles.card} accessibilityViewIsModal>
            <View style={styles.message}>
              <Text style={styles.heading} accessibilityRole="header">
                {t.sendMethod.relayQrTitle}
              </Text>
              <Text style={styles.amount}>{formatPeso(amount)}</Text>
              <Text style={styles.copy} numberOfLines={2}>
                {recipientLabel}
              </Text>
            </View>

            <View style={styles.qrBox} accessible accessibilityLabel={t.sendMethod.relayQrA11y}>
              {value ? (
                <QRCode value={value} size={QR_SIZE} color={colors.text} backgroundColor={colors.surface} quietZone={0} ecl="M" />
              ) : null}
            </View>

            <Text style={styles.copy}>{t.sendMethod.relayQrBody}</Text>

            <View style={styles.actions}>
              <Button label={t.sendMethod.relayDone} size="large" onPress={onDone} />
              <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
                <Text style={styles.cancelText}>{t.sendMethod.relayCancel}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(34, 32, 33, 0.5)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 30 },
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
  message: { width: '100%', gap: 4, alignItems: 'center' },
  heading: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  amount: { fontFamily: fonts.semibold, fontSize: 28, color: colors.primary, textAlign: 'center' },
  copy: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  // A white quiet zone around the code so cheap cameras lock on quickly.
  qrBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  actions: { width: '100%', gap: 4 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontFamily: fonts.medium, fontSize: 16, color: colors.primary },
  pressed: { opacity: 0.7 },
});
