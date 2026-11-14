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

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 1000;

const CATEGORIES: { key: FeedbackCategory; label: string; placeholder: string }[] = [
  { key: 'payment', label: 'Payment problem', placeholder: 'e.g. I sent ₱500 by SMS yesterday and it has not arrived.' },
  { key: 'account', label: 'Account or sign-in', placeholder: 'e.g. My MPIN is not accepted after I changed it.' },
  { key: 'bug', label: "Something isn't working", placeholder: 'Tell us what you were doing and what happened.' },
  { key: 'suggestion', label: 'Suggestion', placeholder: 'What would make HoneBill better for you?' },
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

  const placeholder = CATEGORIES.find((c) => c.key === category)?.placeholder;

  const send = async () => {
    if (busy) return;
    const text = message.trim();
    if (text.length < MESSAGE_MIN) {
      setError('Please tell us a little more.');
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
      else setError('Your report could not be saved. Please try again when you are online.');
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
          <Notice tone="info" title="Thank you! Your report was sent.">
            Our team reads every report. We can't reply in the app yet, but your report helps us fix problems faster.
          </Notice>
        ) : (
          <Notice tone="warning" title="Saved. We'll send it when you're back online.">
            Your report is kept on this phone and goes out automatically the next time you have a connection.
          </Notice>
        )}
        <Button label="Done" size="large" onPress={navigation.goBack} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Help & Feedback"
      subtitle="Tell us about a problem or an idea. We read every report."
      onBack={navigation.goBack}
    >
      {tx ? (
        <View style={styles.txCard} accessibilityLabel="The payment this report is about">
          <Text style={styles.sectionLabel}>About this payment</Text>
          <Text style={styles.txTitle}>{tx.description}</Text>
          <Text style={styles.txLine}>
            {formatAmount(tx.amount, tx.assetCode)} · Ref {displayRef(tx)} · {tx.status}
          </Text>
          <Text style={styles.txLine}>{formatReceiptDate(new Date(tx.timestamp))}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What is it about?</Text>
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
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.messageHeader}>
          <Text style={styles.sectionLabel}>Your message</Text>
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
          accessibilityLabel="Your message"
          style={[styles.message, fieldStateStyle(focus.focused, message.length > 0)]}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      {!connected ? (
        <Notice tone="info">You're offline. Your report will be saved and sent when you're back online.</Notice>
      ) : null}
      <Text style={styles.privacy}>
        We include your Short ID, the app version and your phone type so we can look into it. Never share your MPIN or
        recovery phrase, not even with us.
      </Text>
      <Button label={busy ? 'Sending…' : 'Send report'} size="large" onPress={() => void send()} disabled={busy} />
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
