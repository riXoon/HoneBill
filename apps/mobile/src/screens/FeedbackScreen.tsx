import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { APP_VERSION_LABEL } from '../config/appVersion';
import { randomUUID } from 'expo-crypto';

import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Notice';
import { SettingsPage } from '../components/ui/SettingsPage';
import { fieldStateStyle, useFieldFocus } from '../components/ui/fieldState';
import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { useIsOnline } from '../hooks/useIsOnline';
import type { RootStackParamList } from '../navigation/types';
import { errorMessage, isAborted } from '../services/api/client';
import { submitFeedback, type FeedbackCategory, type FeedbackContext, type FeedbackReport } from '../services/api/feedback';
import { reportError } from '../services/errorReporting';
import { enqueueFeedback, isRetryable } from '../services/sync/feedbackOutbox';
import { colors, fonts, radius } from '../theme';
import { displayRef, type Transaction } from '../types/transaction';
import { formatAmount, formatReceiptDate } from '../utils/format';
import { messages, useT } from '../i18n';

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 1000;

/** The categories in order; their labels and examples are in the reader's language (`feedback.categories`). */
const CATEGORIES: { key: FeedbackCategory }[] = [
  { key: 'payment' },
  { key: 'account' },
  { key: 'bug' },
  { key: 'suggestion' },
];

/** The transaction details sent with a payment report, so the team can trace it without asking. */
function transactionContext(tx: Transaction): FeedbackContext {
  return {
    transactionRef: displayRef(tx),
    transactionStatus: tx.status,
    transactionSource: tx.source,
    transactionAmount: tx.amount,
    transactionAsset: tx.assetCode,
    transactionTime: new Date(tx.timestamp).toISOString(),
    ...(tx.nonce ? { transactionNonce: tx.nonce } : {}),
    ...(tx.failureReason ? { failureReason: tx.failureReason } : {}),
  };
}

type Result = 'sent' | 'queued';

/**
 * Help & Feedback: a one-way report to the team (stored, and posted to the team's Discord). Opened from the Profile
 * menu, or from a transaction's "Report a problem" with that payment attached. Works offline: the report waits in the
 * phone's queue and goes out on the next sync.
 */
export function FeedbackScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Feedback'>) {
  const t = useT();
  const { activeAccount } = useAuth();
  const { transactions } = useWalletData();
  const connected = useIsOnline();
  const tx = useMemo(
    () => (route.params?.transactionId ? transactions.find((t) => t.id === route.params?.transactionId) : undefined),
    [route.params?.transactionId, transactions],
  );
  const [category, setCategory] = useState<FeedbackCategory>(tx ? 'payment' : 'bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const focus = useFieldFocus();
  // One id per report, so a double tap or a later retry from the queue is stored once.
  const clientId = useRef(randomUUID());
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const placeholder = CATEGORIES.some((c) => c.key === category) ? t.feedback.categories[category as FeedbackCategory].placeholder : undefined;

  const send = async () => {
    if (busy) return;
    const text = message.trim();
    if (text.length < MESSAGE_MIN) {
      setError(messages().feedback.moreDetail);
      return;
    }
    const report: FeedbackReport = {
      clientId: clientId.current,
      category,
      message: text,
      ...(activeAccount?.shortId ? { shortId: activeAccount.shortId } : {}),
      context: {
        appVersion: APP_VERSION_LABEL,
        platform: Platform.OS,
        online: connected,
        ...(tx ? transactionContext(tx) : {}),
      },
    };

    const queue = (): boolean => {
      if (!activeAccount) return false;
      try {
        enqueueFeedback(activeAccount.stellarPublicKey, report);
        return true;
      } catch (e) {
        reportError(e, { step: 'enqueueFeedback' });
        return false;
      }
    };

    setError(null);
    if (!connected) {
      if (queue()) setResult('queued');
      else setError(messages().feedback.saveFailed);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      await submitFeedback(report, controller.signal);
      setResult('sent');
    } catch (e) {
      if (isAborted(e)) return;
      // No answer or a struggling server: keep it and send it later, like an offline report.
      if (isRetryable(e) && queue()) setResult('queued');
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <SettingsPage title="Help & Feedback" onBack={navigation.goBack}>
        {result === 'sent' ? (
          <Notice tone="info" title={t.feedback.sentTitle}>
            {t.feedback.sentBody}
          </Notice>
        ) : (
          <Notice tone="warning" title={t.feedback.queuedTitle}>
            {t.feedback.queuedBody}
          </Notice>
        )}
        <Button label={t.common.done} size="large" onPress={navigation.goBack} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Help & Feedback"
      subtitle={t.feedback.subtitle}
      onBack={navigation.goBack}
    >
      {tx ? (
        <View style={styles.txCard} accessibilityLabel={t.feedback.txA11y}>
          <Text style={styles.sectionLabel}>{t.feedback.aboutPayment}</Text>
          <Text style={styles.txTitle}>{tx.description}</Text>
          <Text style={styles.txLine}>
            {formatAmount(tx.amount, tx.assetCode)} · Ref {displayRef(tx)} · {tx.status}
          </Text>
          <Text style={styles.txLine}>{formatReceiptDate(new Date(tx.timestamp))}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.feedback.whatAbout}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {CATEGORIES.map((c) => {
            const selected = c.key === category;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setCategory(c.key)}
                style={[styles.chip, selected ? styles.chipActive : styles.chipIdle]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{t.feedback.categories[c.key].label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.messageHeader}>
          <Text style={styles.sectionLabel}>{t.feedback.yourMessage}</Text>
          <Text style={styles.counter}>
            {message.length}/{MESSAGE_MAX}
          </Text>
        </View>
        <TextInput
          value={message}
          onChangeText={(value) => {
            setMessage(value);
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={MESSAGE_MAX}
          textAlignVertical="top"
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          accessibilityLabel={t.feedback.yourMessage}
          style={[styles.message, fieldStateStyle(focus.focused, message.length > 0)]}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      {!connected ? (
        <Notice tone="info">{t.feedback.offline}</Notice>
      ) : null}
      <Text style={styles.privacy}>
        {t.feedback.privacy}
      </Text>
      <Button label={busy ? t.feedback.sending : t.feedback.send} size="large" onPress={() => void send()} disabled={busy} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.primarySoft },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  chipTextActive: { fontFamily: fonts.medium, color: colors.surface },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  message: {
    minHeight: 140,
    padding: 14,
    borderRadius: radius.field,
    borderWidth: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral },
  privacy: { fontFamily: fonts.light, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  txCard: {
    gap: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  txTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  txLine: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
