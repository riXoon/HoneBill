import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot, type MascotMood } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { RelayQrDialog } from '../components/send/RelayQrDialog';
import { SendLayout } from '../components/send/SendLayout';
import { ChevronForwardIcon, SwapIcon } from '../components/ui/smallIcons';
import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import type { DispatchMethod } from '../types/send';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { buildOfflineVoucher } from '../services/offline/voucher';
import { MissingGatewayError, openVoucherSms, relayQrPayload } from '../services/offline/voucherFormat';
import {
  clearSmsHandoff,
  pendingPayment,
  saveSmsHandoff,
  voucherNonce,
} from '../services/offline/smsDispatch';
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
  /** The QR shown for a partner to scan and text ("Get Help Sending"); null while it is closed. */
  const [relayQr, setRelayQr] = useState<string | null>(null);

  const { trackOfflineDispatch, holdOffline, releaseOfflineHold } = useWalletData();
  /** When the voucher first left the app (messaging app opened, or QR shown): its hold's time, and the payment's. */
  const heldAt = useRef<number | null>(null);

  /**
   * Holds the voucher's money before it leaves the app. From the moment the messaging app holds the text (or a partner
   * can scan the QR) it can settle at any time, whatever the person answers later, so what can be spent must already
   * exclude it. Released only by the server's answer once online, or right away if the messaging app never opened.
   */
  const holdVoucher = (signed: string): number => {
    const at = heldAt.current ?? Date.now();
    holdOffline(pendingPayment(voucherNonce(signed), draft.amount, findRecipientById(draft.recipientId) ?? null, at));
    return at;
  };

  // The SMS receipt opens from SmsDispatchPrompt after the user confirms sending the text.
  const finish = useCallback(
    (signed: string, method: DispatchMethod) => {
      const nonce = voucherNonce(signed);
      const issuedAt = heldAt.current ?? Date.now();
      trackOfflineDispatch(pendingPayment(nonce, draft.amount, findRecipientById(draft.recipientId) ?? null, issuedAt), signed);
      navigation.navigate('SendReceipt', { ...draft, method, reference: nonce, issuedAt });
    },
    [navigation, draft, trackOfflineDispatch],
  );

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
      if (!signed || !activeAccount) return;
      const alreadyLeft = heldAt.current !== null;
      // Keep the handoff even if the app locks or closes while Messages is open.
      const dispatch = {
        publicKey: activeAccount.stellarPublicKey,
        voucher: signed,
        nonce: voucherNonce(signed),
        draft,
        recipient: findRecipientById(draft.recipientId) ?? null,
        openedAt: heldAt.current ?? Date.now(),
      };
      await saveSmsHandoff(dispatch);
      heldAt.current = dispatch.openedAt;
      holdVoucher(signed);
      try {
        await openVoucherSms(signed);
      } catch (error) {
        // The messaging app never opened: nothing to ask about. If the voucher never left the app before either
        // (an earlier text or QR), it can never settle, so its money is free again.
        await clearSmsHandoff(dispatch.publicKey, dispatch.nonce);
        if (!alreadyLeft) {
          heldAt.current = null;
          releaseOfflineHold(dispatch.nonce);
        }
        throw error;
      }
    } catch (error) {
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
      if (!signed) return;
      const payload = relayQrPayload(signed);
      // A partner can scan it as soon as it is on screen, so it is held from now on, even if the dialog is closed.
      heldAt.current = holdVoucher(signed);
      setRelayQr(payload);
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
