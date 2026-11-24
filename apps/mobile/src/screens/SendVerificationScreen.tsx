import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { Notice } from '../components/ui/Notice';
import { CheckIcon, CheckTitleIcon, OfflineFundsBadge, RecipientIcon } from '../components/ui/smallIcons';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { useIsOnline } from '../hooks/useIsOnline';
import { useOfflineTokenSymbol } from '../hooks/useOfflineTokenSymbol';
import { messages, useT } from '../i18n';
import { useSendMode } from '../hooks/useSendMode';
import { afterNextPaint } from '../utils/async';
import { formatPeso } from '../utils/format';
import type { RootStackParamList } from '../navigation/types';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { quoteOfflineFeeCents, spendableCents } from '../services/offline/fees';
import { findRecipientById } from '../services/recipientDirectory';
import { PendingTransactionError } from '../services/stellar/sorobanRpc';
import { loadStellar } from '../services/wallet/signer';
import { sendOnline } from '../services/walletActions';
import { colors, fonts } from '../theme';

// Figma: Send 3 - Verification (870:2796), 402x874.

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
  const { recipientId, amount, note, mode } = route.params;
  const recipient = findRecipientById(recipientId);
  // The design shows the box ticked; it starts unticked here so authorising is always a deliberate step.
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const connected = useIsOnline();
  const t = useT();
  // Which funds this spends is the view the payment was started from, not whether the phone has internet.
  const online = useSendMode(mode) === 'online';
  const tokenSymbol = useOfflineTokenSymbol(!online);
  const { activeAccount } = useAuth();
  const { balances, refresh, addLocalActivity } = useWalletData();
  const available = balances?.online ?? null;
  // An offline payment also costs the toll, which the vault pays on top of the amount.
  const feeCents = online ? 0 : quoteOfflineFeeCents(amount, tokenSymbol);
  const totalCents = Math.round(amount * 100) + feeCents;
  const total = totalCents / 100;
  const enough = !online || (available !== null && totalCents <= spendableCents(available));

  useEffect(() => {
    if (!recipient) navigation.goBack();
  }, [recipient, navigation]);

  // The Stellar SDK is large and is otherwise evaluated at the first signature, inside the swipe's wait. Loading it
  // while the user reads this screen takes that off the critical path. It holds no secrets.
  useEffect(() => {
    void loadStellar().catch(() => undefined);
  }, []);
  if (!recipient) return null;

  /** Online there is nothing to choose: the transfer goes straight through. Offline, Method decides how the voucher leaves. */
  const authorize = async () => {
    if (!online) {
      navigation.navigate('SendMethod', { recipientId, amount, note, mode: 'offline', expectedFeeCents: feeCents });
      return;
    }
    if (!connected) {
      Alert.alert(messages().verify.noInternetTitle, messages().verify.noInternetBody);
      return;
    }
    if (!activeAccount || !recipient.stellarPublicKey || running.current) return;
    running.current = true;
    setBusy(true);
    await afterNextPaint();
    try {
      const hash = await sendOnline(activeAccount.stellarPublicKey, recipient.stellarPublicKey, amount);
      void refresh({ force: true });
      navigation.navigate('SendReceipt', { recipientId, amount, note, mode: 'online', method: 'online', reference: hash, issuedAt: Date.now() });
    } catch (error) {
      if (error instanceof PendingTransactionError) {
        addLocalActivity([{
          id: `online:${error.hash}:out`, timestamp: Date.now(), source: 'wallet', direction: 'out',
          amount, assetCode: 'PHPC', description: messages().verify.pendingTo(recipient.name), status: 'pending', ref: error.hash,
        }]);
        void refresh({ force: true });
        const copy = messages().common;
        Alert.alert(copy.pendingConfirmation, copy.pendingConfirmationBody, [{
          text: copy.done,
          onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'History' } }] }),
        }]);
        return;
      }
      if (!(error instanceof UserFacingError)) reportError(error, { step: 'sendOnline' });
      Alert.alert(messages().verify.notSentTitle, errorMessage(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const canAuthorize = confirmed && enough && !busy && (!online || Boolean(recipient.stellarPublicKey));
  const swipeLabel = busy ? t.verify.sending : t.verify.swipe;

  return (
    <SendLayout
      title={t.verify.title}
      icon={<CheckTitleIcon />}
      onBack={navigation.goBack}
      gap={12}
      processing={busy ? { title: t.verify.processing(formatPeso(amount), recipient.name) } : null}
      footer={
        <SwipeToEnter
          label={swipeLabel}
          accessibilityLabel={
            busy
              ? t.verify.sendingA11y
              : !enough
                ? t.verify.notEnoughA11y
                : confirmed
                  ? t.verify.swipeA11y
                  : t.verify.confirmFirstA11y
          }
          disabled={!canAuthorize}
          busy={busy}
          onComplete={() => void authorize()}
        />
      }
    >
      <View style={styles.total}>
        <Text style={styles.totalLabel}>{t.verify.totalLabel}</Text>
        <Text style={styles.totalAmount} accessibilityLabel={t.verify.totalA11y(formatPeso(amount))}>
          {formatPeso(amount)}
        </Text>
        <View style={styles.escrow}>
          <View style={[styles.escrowDot, online && styles.escrowDotOnline]} />
          <Text style={styles.escrowText}>{online ? 'online transfer' : 'offline local escrow'}</Text>
        </View>
      </View>

      {!enough ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {available === null ? t.amount.unavailable : t.verify.notEnough('online')}
        </Text>
      ) : null}

      <GlassCard style={styles.panel}>
        <Text style={styles.caption}>{t.verify.recipientCaption}</Text>
        <AccountRow icon={<RecipientIcon />} title={recipient.name} subtitle={`Short ID: ${recipient.shortId}`} />
        {recipient.unverified ? (
          <Notice tone="warning" title={t.verify.uncheckedTitle}>
            {t.verify.uncheckedBody}
          </Notice>
        ) : null}
        <Text style={styles.caption}>{t.verify.senderCaption}</Text>
        <AccountRow
          icon={<OfflineFundsBadge color={colors.surface} />}
          title={online ? t.verify.myWallet : t.verify.myVault}
          subtitle={online ? 'Online funds' : 'Offline funds'}
        />
        <View style={styles.memo}>
          <Text style={styles.caption}>NOTE / MEMO</Text>
          <Text style={styles.memoText}>{note || t.verify.defaultMemo}</Text>
        </View>
      </GlassCard>

      <GlassCard style={styles.summary}>
        <View style={styles.breakdown}>
          <SummaryRow label={online ? t.verify.amountSent : t.verify.recipientGets} value={formatPeso(amount)} />
          {!online ? <SummaryRow label={t.verify.offlineFee} value={formatPeso(feeCents / 100)} /> : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalRowLabel}>{t.verify.totalDeducted}</Text>
          <Text style={styles.totalRowValue}>{formatPeso(total)}</Text>
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
          <Text style={styles.confirmText}>{t.verify.confirm}</Text>
        </Pressable>
      </GlassCard>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  total: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  totalLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
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
  escrowDotOnline: { backgroundColor: colors.statusOnline },
  escrowText: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' },

  problem: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral, textAlign: 'center' },
  panel: { padding: 12, gap: 6 },
  caption: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
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
  accountTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  accountSubtitle: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  memo: { gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.placeholderTint },
  memoText: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },

  summary: { padding: 14, gap: 8 },
  breakdown: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  divider: { height: 1, backgroundColor: 'rgba(34, 32, 33, 0.2)' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRowLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  totalRowValue: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },

  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  // The unticked state is not in the design: same 18 dp box and radius, outlined in the primary orange.
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  confirmText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.text },
});
