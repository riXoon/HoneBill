import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AmountField, amountProblem, parseAmount } from '../components/send/AmountField';
import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { AddBoxIcon, InfoIcon } from '../components/ui/smallIcons';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import { useWalletData } from '../context/WalletDataContext';
import { useTopUp } from '../hooks/useTopUp';
import type { TopUpStep } from '../services/walletActions';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';
import { formatPeso, formatWhole } from '../utils/format';

const STEP_LABEL: Record<TopUpStep, string> = {
  preparing: 'GETTING READY…',
  wallet: 'SETTING UP WALLET…',
  requesting: 'REQUESTING TOP-UP…',
  paying: 'ADDING FUNDS…',
};
/** The same steps, worded for the loading screen. */
const STEP_TEXT: Record<TopUpStep, string> = {
  preparing: 'Getting ready…',
  wallet: 'Setting up your wallet…',
  requesting: 'Requesting the top-up…',
  paying: 'Adding funds…',
};

/**
 * Top-up: adds PHPC to the online wallet through the anchor's deposit. On testnet the anchor pays from its own
 * distributor, so no real money moves. The first top-up also sets up the wallet to hold PHPC (a trustline).
 */
export function TopUpScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'TopUp'>) {
  const { balances } = useWalletData();
  const { busy, step, submit } = useTopUp(navigation.goBack);
  const [amountText, setAmountText] = useState('');

  const amount = parseAmount(amountText);
  // Only "enter an amount": the anchor sets the limits and says so if one is exceeded.
  const problem = amountProblem(amount);
  const valid = problem === null;

  return (
    <SendLayout
      title="Top-up"
      icon={<AddBoxIcon size={24} color={colors.text} />}
      onBack={navigation.goBack}
      processing={busy ? { title: `Adding ${formatPeso(amount)} to your wallet`, step: STEP_TEXT[step ?? 'preparing'] } : null}
      footer={
        <View style={styles.footer}>
          <Mascot mood="bill" width={264} />
          <SwipeToEnter
            label={busy ? STEP_LABEL[step ?? 'preparing'] : 'SWIPE TO  TOP UP'}
            accessibilityLabel={
              busy
                ? `Adding ${formatPeso(amount)}, please wait`
                : valid
                  ? `Swipe to top up ${formatPeso(amount)}`
                  : 'Swipe to top up, enter a valid amount first'
            }
            disabled={!valid || busy}
            busy={busy}
            onComplete={() => void submit(amount)}
          />
        </View>
      }
    >
      <GlassCard style={styles.card}>
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem ?? ' '}
        </Text>
        <AmountField value={amountText} onChangeText={busy ? () => undefined : setAmountText} />
        <Text style={styles.hint}>
          Online balance: PHP {balances ? formatWhole(balances.online) : '--'}
        </Text>
      </GlassCard>

      <View style={styles.noteRow}>
        <InfoIcon color={colors.textMuted} />
        <Text style={styles.noteText}>
          This is a test top-up: the anchor adds PHPC to your online wallet and no real money is charged. Your first
          top-up takes a little longer while your wallet is set up to hold PHPC.
        </Text>
      </View>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  problem: { minHeight: 15, fontFamily: fonts.regular, fontSize: 14, color: colors.coral, textAlign: 'center' },
  hint: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  noteText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  footer: { alignItems: 'center', gap: 20 },
});
