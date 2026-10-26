import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { CheckIcon, CheckTitleIcon, OfflineFundsBadge, RecipientIcon } from '../components/ui/smallIcons';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import { SERVICE_FEE, findRecipientById, formatPeso } from '../mocks/send';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Send 3 - Verification (870:2796), 402x874.
const DEFAULT_MEMO = 'Offline transaction';

function AccountRow({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <View style={styles.account}>
      <View style={styles.accountIcon}>{icon}</View>
      <View style={styles.accountText}>
        <Text style={styles.accountTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.accountSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function SendVerificationScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendVerification'>) {
  const { recipientId, amount, note } = route.params;
  const recipient = findRecipientById(recipientId);
  // The design shows the box ticked; it starts unticked here so authorising is always a deliberate step.
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!recipient) navigation.goBack();
  }, [recipient, navigation]);
  if (!recipient) return null;

  return (
    <SendLayout
      title="Verification"
      icon={<CheckTitleIcon />}
      onBack={navigation.goBack}
      gap={12}
      footer={
        <SwipeToEnter
          label="SWIPE TO  AUTHORIZE"
          accessibilityLabel={confirmed ? 'Swipe to authorize' : 'Swipe to authorize, confirm the details first'}
          disabled={!confirmed}
          onComplete={() => navigation.navigate('SendMethod', { recipientId, amount, note })}
        />
      }
    >
      <View style={styles.total}>
        <Text style={styles.totalLabel}>TOTAL TRANSFER AMOUNT</Text>
        <Text style={styles.totalAmount} accessibilityLabel={`Total transfer amount ${formatPeso(amount)}`}>
          {formatPeso(amount)}
        </Text>
        <View style={styles.escrow}>
          <View style={styles.escrowDot} />
          <Text style={styles.escrowText}>offline local escrow</Text>
        </View>
      </View>

      <GlassCard style={styles.panel}>
        <Text style={styles.caption}>RECIPIENT ACCOUNT</Text>
        <AccountRow icon={<RecipientIcon />} title={recipient.name} subtitle={`Short ID: ${recipient.shortId}`} />
        <Text style={styles.caption}>SENDER ACCOUNT</Text>
        <AccountRow icon={<OfflineFundsBadge color={colors.surface} />} title="My Vault Wallet" subtitle="Offline funds" />
        <View style={styles.memo}>
          <Text style={styles.caption}>NOTE / MEMO</Text>
          <Text style={styles.memoText}>{note || DEFAULT_MEMO}</Text>
        </View>
      </GlassCard>

      <GlassCard style={styles.summary}>
        <View style={styles.breakdown}>
          <SummaryRow label="Amount sent" value={formatPeso(amount)} />
          <SummaryRow label="Service Fee" value={formatPeso(SERVICE_FEE)} />
        </View>
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalRowLabel}>Total deducted</Text>
          <Text style={styles.totalRowValue}>{formatPeso(amount + SERVICE_FEE)}</Text>
        </View>
        <View style={styles.divider} />
      </GlassCard>

      <GlassCard>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((c) => !c)}
          style={styles.confirm}
        >
          <View style={[styles.box, confirmed && styles.boxChecked]}>{confirmed ? <CheckIcon /> : null}</View>
          <Text style={styles.confirmText}>I confirm that the recipient details and amount are correct.</Text>
        </Pressable>
      </GlassCard>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  total: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  totalLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  totalAmount: { fontFamily: fonts.semibold, fontSize: 36, lineHeight: 41.4, color: colors.text, textAlign: 'center' },
  escrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: colors.surfaceTranslucent,
  },
  escrowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusOffline },
  escrowText: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted, textTransform: 'uppercase' },

  panel: { padding: 12, gap: 6 },
  caption: { fontFamily: fonts.regular, fontSize: 8, color: colors.textMuted },
  account: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: { flex: 1, gap: 2, justifyContent: 'center' },
  accountTitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  accountSubtitle: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  memo: { gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.placeholderTint },
  memoText: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },

  summary: { padding: 14, gap: 8 },
  breakdown: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.medium, fontSize: 10, color: colors.text },
  divider: { height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRowLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  totalRowValue: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },

  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  // The unticked state is not in the design: same 18 dp box and radius, outlined in the primary orange.
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  confirmText: { flex: 1, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15, color: colors.text },
});
