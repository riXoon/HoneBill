import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot, type MascotMood } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { RelayQrDialog } from '../components/send/RelayQrDialog';
import { SendLayout } from '../components/send/SendLayout';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ChevronForwardIcon, SwapIcon } from '../components/ui/smallIcons';
import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import type { DispatchMethod } from '../types/send';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { buildOfflineVoucher } from '../services/offline/voucher';
import { MissingGatewayError, openVoucherSms, relayQrPayload } from '../services/offline/voucherFormat';
import { findRecipientById } from '../services/recipientDirectory';
import { pesosToStroops } from '../services/walletActions';
import { messages, useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Send 4 - Method (870:3236), 402x874.
const MASCOT_WIDTH = 126;
type Option = { method: DispatchMethod; mood: MascotMood; title: string; body: string; badge: string };

export function SendMethodScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendMethod'>) {
  const draft = route.params;
  const t = useT();
  // The badges are labels, kept in English like the other product words.
  const OPTIONS: Option[] = [
    { method: 'sms', mood: 'phone', title: t.sendMethod.smsTitle, body: t.sendMethod.smsBody, badge: 'SMS DISPATCH' },
    { method: 'relay', mood: 'alert', title: t.sendMethod.relayTitle, body: t.sendMethod.relayBody, badge: 'OFFLINE RELAY' },
  ];

  useEffect(() => {
    if (!findRecipientById(draft.recipientId)) navigation.goBack();
  }, [draft.recipientId, navigation]);

  const { activeAccount } = useAuth();
  const [building, setBuilding] = useState(false);
  // The signed voucher for this draft. Kept so a retry texts the same voucher (same nonce) instead of signing a
  // second one: the contract settles a nonce once, so a repeat can never pay twice.
  const voucher = useRef<string | null>(null);
  const awaitingSend = useRef(false);
  /** Shows the "Did you send the text?" dialog. */
  const [confirmingSend, setConfirmingSend] = useState(false);
  /** The QR shown for a partner to scan and text ("Get Help Sending"); null while it is closed. */
  const [relayQr, setRelayQr] = useState<string | null>(null);

  const { addPendingOffline } = useWalletData();

  const finish = useCallback(
    (signed: string, method: DispatchMethod) => {
      // The voucher's fifth field is its nonce, unique to this payment, so it serves as the reference.
      const nonce = signed.split(':')[4] ?? signed;
      const issuedAt = Date.now();
      const recipient = findRecipientById(draft.recipientId);
      // The server lists this only after it has settled the text, which can be long after (the sender may have no
      // data). Showing it as pending now means the sender's History is not blank about a payment they just made.
      // The voucher is also queued, so the phone settles it over the internet once it is online.
      addPendingOffline(
        {
          id: `pending:${nonce}`,
          timestamp: issuedAt,
          source: 'offline',
          direction: 'out',
          amount: draft.amount,
          assetCode: 'PHPC',
          description: !recipient
            ? 'Sent to recipient'
            : recipient.unverified
              ? `Sent to ID ${recipient.shortId}`
              : `Sent to ${recipient.name}`,
          status: 'pending',
          ref: nonce,
          nonce,
          ...(recipient ? { counterpartyShortId: recipient.shortId } : {}),
        },
        signed,
      );
      navigation.navigate('SendReceipt', { ...draft, method, reference: nonce, issuedAt });
    },
    [navigation, draft, addPendingOffline],
  );

  // The text app cannot say whether the message went out, so when the user comes back, ask.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingSend.current || !voucher.current) return;
      awaitingSend.current = false;
      setConfirmingSend(true);
    });
    return () => sub.remove();
  }, []);

  /**
   * Signs the voucher once per draft. Both methods share it, so switching from one to the other (or retrying) never
   * makes a second voucher: the contract settles a nonce once, so a repeat can never pay twice.
   */
  const prepareVoucher = async (): Promise<string | null> => {
    if (!activeAccount) return null;
    const recipient = findRecipientById(draft.recipientId);
    if (!recipient) return null;
    voucher.current ??= await buildOfflineVoucher({
      walletPublicKey: activeAccount.stellarPublicKey,
      senderShortId: activeAccount.shortId,
      receiverShortId: recipient.shortId,
      amountStroops: BigInt(pesosToStroops(draft.amount)),
    });
    return voucher.current;
  };

  const showPrepareError = (error: unknown, step: string, fallback: string) => {
    if (!(error instanceof UserFacingError)) reportError(error, { step });
    Alert.alert(messages().sendMethod.prepareFailedTitle, error instanceof UserFacingError ? errorMessage(error) : fallback);
  };

  const sendBySms = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const signed = await prepareVoucher();
      if (!signed) return;
      awaitingSend.current = true;
      await openVoucherSms(signed);
    } catch (error) {
      awaitingSend.current = false;
      if (error instanceof MissingGatewayError) {
        Alert.alert('Not available', 'The payment number is not set. Add EXPO_PUBLIC_SMS_GATEWAY_NUMBER to .env.');
        return;
      }
      showPrepareError(error, 'sendBySms', messages().sendMethod.noMessagingApp);
    } finally {
      setBuilding(false);
    }
  };

  // No text load: show the signed voucher as a QR. A partner scans it in HoneBill and their phone texts it for the user.
  const relay = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const signed = await prepareVoucher();
      if (signed) setRelayQr(relayQrPayload(signed));
    } catch (error) {
      if (error instanceof MissingGatewayError) {
        Alert.alert('Not available', 'The payment number is not set. Add EXPO_PUBLIC_SMS_GATEWAY_NUMBER to .env.');
        return;
      }
      showPrepareError(error, 'relayVoucher', messages().sendMethod.relayFailed);
    } finally {
      setBuilding(false);
    }
  };

  const dispatch = (method: DispatchMethod) => {
    if (method === 'sms') void sendBySms();
    else void relay();
  };

  const recipient = findRecipientById(draft.recipientId);
  const recipientLabel = !recipient
    ? ''
    : recipient.unverified
      ? t.sendMethod.relayTo(`ID ${recipient.shortId}`)
      : t.sendMethod.relayTo(recipient.name);

  return (
    <SendLayout title={t.sendMethod.title} icon={<SwapIcon />} onBack={navigation.goBack}>
      <Text style={styles.question} accessibilityRole="header">
        {t.sendMethod.question}
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.method}
            accessibilityRole="button"
            accessibilityLabel={`${o.title}. ${o.body} ${o.badge}`}
            onPress={() => dispatch(o.method)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <GlassCard style={styles.card}>
              <View style={styles.content}>
                <View style={styles.illustration}>
                  <Mascot mood={o.mood} width={MASCOT_WIDTH} />
                </View>
                <View style={styles.text}>
                  <View style={styles.copy}>
                    <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {o.title}
                    </Text>
                    <Text style={styles.body}>{o.body}</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{o.badge}</Text>
                  </View>
                </View>
                <View style={styles.chevron}>
                  <ChevronForwardIcon />
                </View>
              </View>
            </GlassCard>
          </Pressable>
        ))}
      </View>
      <ConfirmDialog
        visible={confirmingSend}
        mood="phone"
        title={t.sendMethod.sentTitle}
        message={t.sendMethod.sentBody}
        confirmLabel={t.sendMethod.sentYes}
        cancelLabel={t.sendMethod.sentNo}
        onConfirm={() => {
          setConfirmingSend(false);
          if (voucher.current) finish(voucher.current, 'sms');
        }}
        onCancel={() => setConfirmingSend(false)}
      />
      <RelayQrDialog
        visible={relayQr !== null}
        value={relayQr}
        amount={draft.amount}
        recipientLabel={recipientLabel}
        onDone={() => {
          setRelayQr(null);
          if (voucher.current) finish(voucher.current, 'relay');
        }}
        onClose={() => setRelayQr(null)}
      />
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: fonts.regular, fontSize: 17, color: colors.text },
  options: { gap: 12 },
  pressed: { opacity: 0.85 },
  card: { padding: 16 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // The 126 dp Honi is wider than the 80 dp inside the padding, as in the design: it overflows the outline.
  illustration: {
    width: 100,
    height: 100,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  text: { flex: 1, minHeight: 100, justifyContent: 'space-between', gap: 8, paddingHorizontal: 10 },
  copy: { gap: 8 },
  title: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.text },
  badgeText: { fontFamily: fonts.regular, fontSize: 11, color: colors.surface, textAlign: 'center' },
  chevron: { height: 100, justifyContent: 'center' },
});
