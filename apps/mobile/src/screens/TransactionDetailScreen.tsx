import { Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { ReceiptBarcode, VoucherEdge } from '../components/send/ReceiptBarcode';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { DownloadIcon, OfflineFundsBadge, ReceiptIcon } from '../components/ui/smallIcons';
import { useWalletData } from '../context/WalletDataContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';
import { Notice, type NoticeTone } from '../components/ui/Notice';
import { EXPIRED_REASON, SOURCE_LABEL, displayRef, failureText, type TransactionStatus } from '../types/transaction';
import { formatAmount, formatReceiptDate } from '../utils/format';
import { useT } from '../i18n';

// Detail page for one Transactions row. Built from the Receipt voucher (870:2835) so it shares the brand look.
/** An offline payment still unconfirmed after this gets the "connect to check" hint. */
const LONG_WAIT_MS = 24 * 60 * 60 * 1000;
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
  const t = useT();
  const { transactions } = useWalletData();
  const { id, activity } = route.params;
  const tx = transactions.find((t) => t.id === id) ?? (activity && transactions.find((t) =>
    t.ref.toLowerCase() === activity.ref.toLowerCase() && t.source === activity.source && t.direction === activity.direction));
  if (!tx) return null;

  const incoming = tx.direction === 'in';
  const offline = tx.source === 'offline';
  const offlineVoucher = offline && !tx.id.startsWith('move:');
  const amount = formatAmount(tx.amount, tx.assetCode);
  const signed = `${incoming ? '+' : '-'} ${amount}`;
  const when = formatReceiptDate(new Date(tx.timestamp));
  const ref = displayRef(tx);
  const waitingLong = offlineVoucher && tx.status === 'pending' && Date.now() - tx.timestamp > LONG_WAIT_MS;
  const ledger =
    tx.status === 'failed'
      ? 'Failed'
      : tx.status === 'pending'
        ? offlineVoucher
          ? t.txDetail.sentBySms
          : 'Pending'
        : offline
          ? 'Synced'
          : 'Confirmed';
  // What the person needs to know beyond the status: why it failed, or how to find out.
  const note =
    tx.status === 'failed'
      ? failureText(tx)
      : tx.status === 'pending'
        ? offlineVoucher
          ? (!incoming ? (waitingLong ? t.txDetail.stillNotConfirmed : t.txDetail.willText(ref)) : null)
          : t.common.pendingConfirmationBody
        : null;
  // Never answered is a warning (check the balance); rejected is an error; still waiting is information.
  const unconfirmed = tx.status === 'failed' && tx.failureReason === EXPIRED_REASON;
  const noteTone: NoticeTone = unconfirmed ? 'warning' : tx.status === 'failed' ? 'error' : 'info';
  const noteTitle = unconfirmed
    ? t.txDetail.couldNotConfirm
    : tx.status === 'failed'
      ? t.txDetail.didNotGoThrough
      : waitingLong
        ? t.txDetail.stillWaiting
        : t.txDetail.waiting;

  const share = () =>
    void Share.share({
      message: t.txDetail.shareMessage(incoming ? t.txDetail.received : t.txDetail.sent, amount, tx.description, STATUS_LABEL[tx.status], ref, when),
    });
  // Opens Help & Feedback with this payment attached, so the team can trace it without asking.
  const report = () => navigation.navigate('Feedback', { transactionId: tx.id });

  return (
    <SendLayout
      title="Transaction"
      icon={<ReceiptIcon />}
      onBack={navigation.goBack}
      gap={12}
      footer={
        <View style={styles.actions}>
          <Button label={t.receipt.share} size="large" variant="outline" icon={<DownloadIcon color={colors.primary} />} onPress={share} />
          <Text style={styles.report} accessibilityRole="button" onPress={report}>
            {t.txDetail.report}
          </Text>
        </View>
      }
    >
      <GlassCard style={styles.card}>
        <View style={styles.badges}>
          <View style={[styles.status, { backgroundColor: unconfirmed ? colors.primary : STATUS_COLOR[tx.status] }]}>
            <Text style={styles.statusText}>{unconfirmed ? 'Unconfirmed' : STATUS_LABEL[tx.status]}</Text>
          </View>
          {offline ? <OfflineFundsBadge /> : null}
        </View>

        <View style={styles.hero}>
          <Text style={styles.amount} accessibilityLabel={`${incoming ? t.txDetail.received : t.txDetail.sent} ${amount}`}>
            {signed}
          </Text>
          <Text style={styles.when}>{when}</Text>
        </View>

        {note ? (
          <Notice tone={noteTone} title={noteTitle}>
            {note}
          </Notice>
        ) : null}

        <View style={styles.voucher}>
          <View style={styles.details}>
            <DetailRow label={t.txDetail.type} value={incoming ? t.txDetail.received : t.txDetail.sent} />
            <DetailRow label={t.txDetail.source} value={SOURCE_LABEL[tx.source]} />
            <DetailRow label={t.txDetail.description} value={tx.description} strong={false} />
            <DetailRow label={t.txDetail.amount} value={amount} />
            {offline && !incoming && tx.status !== 'failed' && tx.feeCents !== undefined ? (
              <DetailRow label={t.verify.offlineFee} value={formatAmount(tx.feeCents / 100, tx.assetCode)} />
            ) : null}
            <DetailRow label={offline ? 'Sync Status' : 'Stellar Ledger'} value={ledger} />
          </View>
          <View style={styles.divider} />
          <View style={styles.identifier}>
            <ReceiptBarcode />
            <View style={styles.identifierText}>
              <Text style={styles.identifierLine}>Ref No. {ref}</Text>
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
  statusText: { fontFamily: fonts.medium, fontSize: 12, color: colors.surface },
  hero: { alignItems: 'center', gap: 4 },
  amount: { fontFamily: fonts.semibold, fontSize: 28, color: colors.text },
  when: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },

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
  rowLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  rowValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  rowValueStrong: { fontFamily: fonts.medium },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  identifier: { width: '100%', height: 74, gap: 8, alignItems: 'center' },
  identifierText: { width: '100%', gap: 2, alignItems: 'center' },
  identifierLine: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  edge: { position: 'absolute', left: -1, right: -1, bottom: -1 },

  actions: { width: '100%', gap: 12, alignItems: 'center' },
  report: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, paddingVertical: 4 },
});
