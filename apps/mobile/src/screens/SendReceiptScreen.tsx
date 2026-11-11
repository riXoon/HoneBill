import { useCallback, useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { ReceiptBarcode, VoucherEdge } from '../components/send/ReceiptBarcode';
import { SendLayout } from '../components/send/SendLayout';
import { DownloadIcon, ReceiptIcon } from '../components/ui/smallIcons';
import { Button } from '../components/ui/Button';
import { formatPeso, formatReceiptDate, shortRef } from '../utils/format';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
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

  // A finished payment makes the recipient "Recent" on the Send screen.
  useEffect(() => {
    if (recipient && activeAccount?.shortId) void addRecentRecipient(activeAccount.shortId, recipient);
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

  if (!recipient) return null;

  return (
    <SendLayout
      title="Sent"
      icon={<ReceiptIcon />}
      onBack={goHome}
      gap={12}
      centered
      footer={<Button label="Return to Home" size="large" onPress={goHome} />}
    >
      <GlassCard style={styles.card}>
        {/* Saving or sharing the receipt is not wired yet, so the icon is only the design's affordance. */}
        <View style={styles.download} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <DownloadIcon />
        </View>

        <Mascot mood="voucher" />

        <View style={styles.message}>
          <Text style={styles.heading} accessibilityRole="header">
            Receipt Created
          </Text>
          <Text style={styles.copy}>Your transaction is successful.{'\n'}Sent via Honebill</Text>
        </View>

        <View style={styles.voucher}>
          <View style={styles.details}>
            <DetailRow label="Recipient" value={recipient.name} strong={false} />
            <DetailRow label="Short ID" value={recipient.shortId} />
            <DetailRow label="Amount sent" value={formatPeso(amount)} />
            <DetailRow label="Ref. Number" value={shortRef(reference)} />
            <DetailRow label="Stellar Ledger" value={method === 'online' ? SETTLED : PENDING} />
          </View>
          <View style={styles.divider} />
          <View style={styles.identifier}>
            <ReceiptBarcode />
            <View style={styles.identifierText}>
              <Text style={styles.identifierLine}>Ref No. {shortRef(reference)}</Text>
              <Text style={styles.identifierLine}>{formatReceiptDate(new Date(issuedAt))}</Text>
            </View>
          </View>
          {/* Scalloped tear-off edge, overhanging the 1 dp outline by 1 dp on each side. */}
          <View style={styles.edge} pointerEvents="none">
            <VoucherEdge />
          </View>
        </View>
      </GlassCard>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 16, alignItems: 'center' },
  download: { position: 'absolute', top: 16, right: 16 },
  message: { width: '100%', gap: 8 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, color: colors.textMuted, textAlign: 'center' },

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
  rowLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  rowValue: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  rowValueStrong: { fontFamily: fonts.medium },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  identifier: { width: '100%', height: 74, gap: 8, alignItems: 'center' },
  identifierText: { width: '100%', gap: 2, alignItems: 'center' },
  identifierLine: { fontFamily: fonts.regular, fontSize: 8, color: colors.textMuted, textAlign: 'center' },
  edge: { position: 'absolute', left: -1, right: -1, bottom: -1 },
});
