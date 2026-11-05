import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { ReceiptBarcode, VoucherEdge } from '../components/send/ReceiptBarcode';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { DownloadIcon, OfflineFundsBadge, ReceiptIcon } from '../components/ui/smallIcons';
import { useWalletData } from '../context/WalletDataContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';
import { SOURCE_LABEL, type TransactionStatus } from '../types/transaction';
import { formatAmount, formatReceiptDate, shortRef } from '../utils/format';

// Detail page for one Transactions row. Built from the Receipt voucher (870:2835) so it shares the brand look.
const STATUS_LABEL: Record<TransactionStatus, string> = { completed: 'Completed', pending: 'Pending', failed: 'Failed' };
const STATUS_COLOR: Record<TransactionStatus, string> = {
  completed: colors.success,
  pending: colors.primary,
  failed: colors.coral,
};

function DetailRow({ label, value, strong = true }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export function TransactionDetailScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'TransactionDetail'>) {
  const { transactions } = useWalletData();
  const tx = transactions.find((t) => t.id === route.params.id);
  if (!tx) return null;

  const incoming = tx.direction === 'in';
  const offline = tx.source === 'offline';
  const amount = formatAmount(tx.amount, tx.assetCode);
  const signed = `${incoming ? '+' : '-'} ${amount}`;
  const when = formatReceiptDate(new Date(tx.timestamp));
  const ledger =
    tx.status === 'failed'
      ? 'Failed'
      : tx.status === 'pending'
        ? offline
          ? 'Pending sync'
          : 'Pending'
        : offline
          ? 'Synced'
          : 'Confirmed';

  const share = () =>
    void Share.share({
      message: `HoneBill receipt\n${incoming ? 'Received' : 'Sent'} ${amount}\n${tx.description}\nRef No. ${tx.ref}\n${when}`,
    });
  // There is no support flow in the app or backend yet, so say so instead of pretending to file a report.
  const report = () => Alert.alert('Report a problem', `Support for Ref No. ${shortRef(tx.ref)} is not available yet.`);

  return (
    <SendLayout
      title="Transaction"
      icon={<ReceiptIcon />}
      onBack={navigation.goBack}
      gap={12}
      footer={
        <View style={styles.actions}>
          <Button label="Share receipt" size="large" variant="outline" icon={<DownloadIcon color={colors.primary} />} onPress={share} />
          <Text style={styles.report} accessibilityRole="button" onPress={report}>
            Report a problem
          </Text>
        </View>
      }
    >
      <GlassCard style={styles.card}>
        <View style={styles.badges}>
          <View style={[styles.status, { backgroundColor: STATUS_COLOR[tx.status] }]}>
            <Text style={styles.statusText}>{STATUS_LABEL[tx.status]}</Text>
          </View>
          {offline ? <OfflineFundsBadge /> : null}
        </View>

        <View style={styles.hero}>
          <Text style={styles.amount} accessibilityLabel={`${incoming ? 'Received' : 'Sent'} ${amount}`}>
            {signed}
          </Text>
          <Text style={styles.when}>{when}</Text>
        </View>

        <View style={styles.voucher}>
          <View style={styles.details}>
            <DetailRow label="Type" value={incoming ? 'Received' : 'Sent'} />
            <DetailRow label="Source" value={SOURCE_LABEL[tx.source]} />
            <DetailRow label="Description" value={tx.description} strong={false} />
            <DetailRow label="Amount" value={amount} />
            <DetailRow label={offline ? 'Sync Status' : 'Stellar Ledger'} value={ledger} />
          </View>
          <View style={styles.divider} />
          <View style={styles.identifier}>
            <ReceiptBarcode />
            <View style={styles.identifierText}>
              <Text style={styles.identifierLine}>Ref No. {shortRef(tx.ref)}</Text>
              <Text style={styles.identifierLine}>{when}</Text>
            </View>
          </View>
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
  badges: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontFamily: fonts.medium, fontSize: 10, color: colors.surface },
  hero: { alignItems: 'center', gap: 4 },
  amount: { fontFamily: fonts.semibold, fontSize: 28, color: colors.text },
  when: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },

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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  rowLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  rowValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  rowValueStrong: { fontFamily: fonts.medium },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  identifier: { width: '100%', height: 74, gap: 8, alignItems: 'center' },
  identifierText: { width: '100%', gap: 2, alignItems: 'center' },
  identifierLine: { fontFamily: fonts.regular, fontSize: 8, color: colors.textMuted, textAlign: 'center' },
  edge: { position: 'absolute', left: -1, right: -1, bottom: -1 },

  actions: { width: '100%', gap: 12, alignItems: 'center' },
  report: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, paddingVertical: 4 },
});
