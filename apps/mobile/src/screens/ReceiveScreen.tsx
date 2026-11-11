import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AmountField, amountProblem, parseAmount } from '../components/send/AmountField';
import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { GenerateQrIcon, ReceiveTitleIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

/** Step two of Receive: the amount to request. The Short ID QR itself is `ReceiveQr`, which opens first. */
export function ReceiveScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ReceiveAmount'>) {
  const [amountText, setAmountText] = useState('');
  const [tried, setTried] = useState(false);

  const amount = parseAmount(amountText);
  const problem = amountProblem(amount);
  const valid = problem === null;

  return (
    <SendLayout title="Request Amount" icon={<ReceiveTitleIcon />} onBack={navigation.goBack}>
      <View style={styles.details}>
        <GlassCard style={styles.card}>
          <Text style={styles.amountLabel}>{problem && (amount > 0 || tried) ? problem : 'Amount to receive (PHPC)'}</Text>
          <AmountField value={amountText} onChangeText={setAmountText} />
        </GlassCard>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate QR"
          accessibilityState={{ disabled: !valid }}
          onPress={() => {
            // Not `disabled`: a dead button looks broken, so a tap with no amount says what is missing.
            // `replace` so Back from the amount QR returns to the Short ID QR, not to this form.
            if (!valid) setTried(true);
            else navigation.replace('ReceiveQr', { amount });
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <GlassCard style={[styles.generate, !valid && styles.generateOff]}>
            <GenerateQrIcon />
            <Text style={styles.generateText}>Generate QR</Text>
          </GlassCard>
        </Pressable>
      </View>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  details: { gap: 12 },
  card: { padding: 16, gap: 8, alignItems: 'center' },
  amountLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.coral, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  generate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 14 },
  generateOff: { opacity: 0.5 },
  generateText: { fontFamily: fonts.regular, fontSize: 15, color: colors.primary, textAlign: 'center' },
});
