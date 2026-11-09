import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AmountField, amountProblem } from '../components/send/AmountField';
import { GlassCard } from '../components/send/GlassCard';
import { ModePill } from '../components/send/ModePill';
import { SendLayout } from '../components/send/SendLayout';
import { CheckTitleIcon, CopyIcon, GenerateQrIcon, ReceiveTitleIcon, ReceiverIcon } from '../components/ui/smallIcons';
import { fullName, useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Recieve 1 (870:2888), 402x874.
const COPIED_MS = 1500;

export function ReceiveScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ReceiveAmount'>) {
  const { activeAccount } = useAuth();
  const walletAddress = activeAccount?.stellarPublicKey ?? '';
  const [amountText, setAmountText] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const amount = Number(amountText) || 0;
  const problem = amountProblem(amount);
  const valid = problem === null;

  const copyAddress = async () => {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <SendLayout title="Receive" icon={<ReceiveTitleIcon />} onBack={navigation.goBack}>
      <ModePill label="Receive via online" dotColor={colors.statusOnline} />

      <View style={styles.details}>
        <GlassCard style={styles.card}>
          <View style={styles.receiver}>
            <View style={styles.receiverIcon}>
              <ReceiverIcon />
            </View>
            <View style={styles.receiverText}>
              <Text style={styles.name} numberOfLines={1}>
                {fullName(activeAccount)}
              </Text>
              <Text style={styles.id}>ID: {activeAccount?.shortId ?? ''}</Text>
            </View>
          </View>

          <View style={styles.wallet}>
            <Text style={styles.walletLabel}>CREDIT TO WALLET</Text>
            <View style={styles.walletRow}>
              <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
                {walletAddress}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copied ? 'Wallet address copied' : 'Copy wallet address'}
                hitSlop={8}
                onPress={() => void copyAddress()}
              >
                {copied ? <CheckTitleIcon color={colors.primary} /> : <CopyIcon />}
              </Pressable>
            </View>
          </View>

          <View style={styles.amount}>
            <Text style={styles.amountLabel}>{amount > 0 && problem ? problem : 'Add Amount (PHPC)'}</Text>
            <AmountField value={amountText} onChangeText={setAmountText} />
          </View>
        </GlassCard>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate QR"
          accessibilityState={{ disabled: !valid }}
          disabled={!valid}
          onPress={() => navigation.navigate('ReceiveQr', { amount })}
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
  card: { padding: 16, gap: 20, alignItems: 'center' },
  receiver: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12 },
  receiverIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiverText: { flex: 1, gap: 2, justifyContent: 'center' },
  name: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  id: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  wallet: { width: '100%', gap: 8, padding: 12, borderRadius: 12, backgroundColor: 'rgba(247, 247, 251, 0.2)' },
  walletLabel: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  walletRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  address: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  amount: { width: '100%', gap: 8 },
  amountLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.coral, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  generate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 14 },
  generateOff: { opacity: 0.5 },
  generateText: { fontFamily: fonts.regular, fontSize: 15, color: colors.primary, textAlign: 'center' },
});
