import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot, type MascotMood } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { ChevronForwardIcon, SwapIcon } from '../components/ui/smallIcons';
import { SMS_GATEWAY_NUMBER } from '../config/env';
import { useAuth } from '../context/AuthContext';
import type { DispatchMethod } from '../types/send';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { buildOfflineVoucher } from '../services/offline/voucher';
import { findRecipientById } from '../services/recipientDirectory';
import { pesosToStroops } from '../services/walletActions';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Send 4 - Method (870:3236), 402x874.
const MASCOT_WIDTH = 126;
const OPTIONS: { method: DispatchMethod; mood: MascotMood; title: string; body: string; badge: string }[] = [
  {
    method: 'sms',
    mood: 'phone',
    title: 'Send using my phone',
    body: 'Standard SMS charges apply. Active text promo required.',
    badge: 'SMS DISPATCH',
  },
  {
    method: 'relay',
    mood: 'alert',
    title: 'get help sending',
    body: "Don't have text load? Show your screen to a partner so they can scan it and send the text for you",
    badge: 'OFFLINE RELAY',
  },
];

export function SendMethodScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendMethod'>) {
  const draft = route.params;

  useEffect(() => {
    if (!findRecipientById(draft.recipientId)) navigation.goBack();
  }, [draft.recipientId, navigation]);

  const { activeAccount } = useAuth();
  const [building, setBuilding] = useState(false);
  // The signed voucher for this draft. Kept so a retry texts the same voucher (same nonce) instead of signing a
  // second one: the contract settles a nonce once, so a repeat can never pay twice.
  const voucher = useRef<string | null>(null);
  const awaitingSend = useRef(false);

  const finish = useCallback(
    (signed: string) => {
      // The voucher's fifth field is its nonce, unique to this payment, so it serves as the reference.
      navigation.navigate('SendReceipt', {
        ...draft,
        method: 'sms',
        reference: signed.split(':')[4] ?? signed,
        issuedAt: Date.now(),
      });
    },
    [navigation, draft],
  );

  // The text app cannot say whether the message went out, so when the user comes back, ask.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingSend.current || !voucher.current) return;
      awaitingSend.current = false;
      const signed = voucher.current;
      Alert.alert('Did you send the text?', 'Your payment is only made once the message has been sent.', [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Yes, I sent it', onPress: () => finish(signed) },
      ]);
    });
    return () => sub.remove();
  }, [finish]);

  const sendBySms = async () => {
    if (!activeAccount || building) return;
    if (!SMS_GATEWAY_NUMBER) {
      Alert.alert('Not available', 'The payment number is not set. Add EXPO_PUBLIC_SMS_GATEWAY_NUMBER to .env.');
      return;
    }
    const recipient = findRecipientById(draft.recipientId);
    if (!recipient) return;
    setBuilding(true);
    try {
      voucher.current ??= await buildOfflineVoucher({
        walletPublicKey: activeAccount.stellarPublicKey,
        senderShortId: activeAccount.shortId,
        receiverShortId: recipient.shortId,
        amountStroops: BigInt(pesosToStroops(draft.amount)),
      });
      awaitingSend.current = true;
      const separator = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${SMS_GATEWAY_NUMBER}${separator}body=${encodeURIComponent(voucher.current)}`);
    } catch (error) {
      awaitingSend.current = false;
      if (!(error instanceof UserFacingError)) reportError(error, { step: 'sendBySms' });
      Alert.alert(
        'Could not prepare the payment',
        error instanceof UserFacingError ? errorMessage(error) : 'No messaging app could be opened. No money has been moved.',
      );
    } finally {
      setBuilding(false);
    }
  };

  // Relaying lets a partner text the voucher for the user. The partner's scan-and-send side is not built, so say so
  // rather than showing a receipt for a payment that was never sent.
  const dispatch = (method: DispatchMethod) => {
    if (method === 'sms') void sendBySms();
    else Alert.alert('Not available yet', 'Getting help to send is not available yet. No money has been moved.');
  };

  return (
    <SendLayout title="Method" icon={<SwapIcon />} onBack={navigation.goBack}>
      <Text style={styles.question} accessibilityRole="header">
        How do you want to send this?
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
                    <Text style={styles.title} numberOfLines={1}>
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
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
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
  text: { flex: 1, height: 100, justifyContent: 'space-between', paddingHorizontal: 10 },
  copy: { gap: 8 },
  title: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, textTransform: 'capitalize' },
  body: { fontFamily: fonts.regular, fontSize: 8, color: colors.textMuted },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.text },
  badgeText: { fontFamily: fonts.regular, fontSize: 8, color: colors.surface, textAlign: 'center' },
  chevron: { height: 100, justifyContent: 'center' },
});
