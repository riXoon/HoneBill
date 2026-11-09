import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot, type MascotMood } from '../components/mascot/Mascot';
import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { ChevronForwardIcon, SwapIcon } from '../components/ui/smallIcons';
import type { DispatchMethod } from '../types/send';
import { findRecipientById } from '../services/recipientDirectory';
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

  // Building the signed offline voucher and sending it (SMS or relay) is not implemented, so nothing can be
  // dispatched. Say that plainly rather than showing a receipt for a transfer that never happened. When it
  // exists, navigate to 'SendReceipt' with the reference and time the ledger returns.
  const dispatch = (_method: DispatchMethod) =>
    Alert.alert('Not available yet', 'Sending offline payments is not available yet. No money has been moved.');

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
