import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { Mascot } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { ReceiptBarcode, VoucherEdge } from '../components/send/ReceiptBarcode';
import { SendLayout } from '../components/send/SendLayout';
import { DownloadIcon, ReceiptIcon } from '../components/ui/smallIcons';
import { Button } from '../components/ui/Button';
import { formatPeso, formatReceiptDate, shortRef, voucherRef } from '../utils/format';
import { messages, useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { reportError } from '../services/errorReporting';
import { findRecipientById } from '../services/recipientDirectory';
import { addRecentRecipient } from '../services/recipientStore';
import { colors, fonts } from '../theme';

// Figma: Reciept (870:2835), 402x874.
const PENDING = 'Pending Dispatch';
const SETTLED = 'Confirmed';

function DetailRow({ label, value, strong = true }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export function SendReceiptScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendReceipt'>) {
  const { recipientId, amount, reference, issuedAt, method } = route.params;
  const recipient = findRecipientById(recipientId);
  const { activeAccount } = useAuth();
  const t = useT();
  // An online transfer is final here; an offline voucher only settles once the gateway (or the app online) submits it.
  const byText = method !== 'online';
  // A voucher's reference matches the texts the gateway sends about it.
  const ref = byText ? voucherRef(reference) : shortRef(reference);
  /** The receipt as it is shared: everything on the card except the share button itself. */
  const receiptRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // A finished payment makes the recipient "Recent" on the Send screen.
  useEffect(() => {
    // An unchecked ID stays out: once the voucher settles, History names it and Recents looks it up properly.
    if (recipient && !recipient.unverified && activeAccount?.shortId) void addRecentRecipient(activeAccount.shortId, recipient);
  }, [recipient, activeAccount?.shortId]);

  // The receipt ends the flow: Back (button or hardware) goes home instead of back into the finished steps.
  const goHome = useCallback(() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }), [navigation]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [goHome]),
  );

  // Shares the receipt as a PNG picture (not its text), through the phone's share sheet, which also offers "save to gallery".
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(messages().receipt.shareUnavailableTitle, messages().receipt.shareUnavailableBody);
        return;
      }
      const uri = await captureRef(receiptRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: messages().receipt.share, UTI: 'public.png' });
    } catch (e) {
      reportError(e, { step: 'shareReceipt' });
      Alert.alert(messages().receipt.shareFailedTitle, messages().receipt.shareFailedBody);
    } finally {
      setSharing(false);
    }
  };

  if (!recipient) return null;

  return (
    <SendLayout
      title={t.receipt.title}
      icon={<ReceiptIcon />}
      onBack={goHome}
      gap={12}
      centered
      footer={<Button label={t.receipt.returnHome} size="large" onPress={goHome} />}
    >
      <GlassCard>
        {/* Captured as the shared picture. It has its own solid fill, so the image does not come out transparent. */}
        <View ref={receiptRef} collapsable={false} style={styles.card}>
          <Mascot mood="voucher" />

          <View style={styles.message}>
            <Text style={styles.heading} accessibilityRole="header">
              {t.receipt.heading}
            </Text>
            <Text style={styles.copy}>
              {byText ? t.receipt.bySms(ref) : t.receipt.online}
            </Text>
          </View>

          <View style={styles.voucher}>
            <View style={styles.details}>
              <DetailRow label={t.receipt.recipient} value={recipient.name} strong={false} />
              <DetailRow label="Short ID" value={recipient.shortId} />
              <DetailRow label={t.receipt.amountSent} value={formatPeso(amount)} />
              <DetailRow label="Ref. Number" value={ref} />
              <DetailRow label="Stellar Ledger" value={method === 'online' ? SETTLED : PENDING} />
            </View>
            <View style={styles.divider} />
            <View style={styles.identifier}>
              <ReceiptBarcode />
              <View style={styles.identifierText}>
                <Text style={styles.identifierLine}>Ref No. {ref}</Text>
                <Text style={styles.identifierLine}>{formatReceiptDate(new Date(issuedAt))}</Text>
              </View>
            </View>
            {/* Scalloped tear-off edge, overhanging the 1 dp outline by 1 dp on each side. */}
            <View style={styles.edge} pointerEvents="none">
              <VoucherEdge />
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.receipt.share}
          accessibilityState={{ disabled: sharing, busy: sharing }}
          disabled={sharing}
          hitSlop={8}
          onPress={() => void share()}
          style={({ pressed }) => [styles.download, pressed && styles.pressed, sharing && styles.sharing]}
        >
          <DownloadIcon />
        </Pressable>
      </GlassCard>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 16, alignItems: 'center', borderRadius: 12, backgroundColor: colors.card },
  download: { position: 'absolute', top: 12, right: 12, padding: 4 },
  pressed: { opacity: 0.6 },
  sharing: { opacity: 0.4 },
  message: { width: '100%', gap: 8 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },

  voucher: {
    width: '100%',
    padding: 16,
    gap: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: 'rgba(247, 247, 251, 0.2)',
  },
  details: { width: '100%', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  rowValue: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  rowValueStrong: { fontFamily: fonts.medium },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  identifier: { width: '100%', height: 74, gap: 8, alignItems: 'center' },
  identifierText: { width: '100%', gap: 2, alignItems: 'center' },
  identifierLine: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  edge: { position: 'absolute', left: -1, right: -1, bottom: -1 },
});
