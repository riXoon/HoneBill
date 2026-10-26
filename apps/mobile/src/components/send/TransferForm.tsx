import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { OFFLINE_WALLET_BALANCE, ONLINE_WALLET_BALANCE, type WalletKind } from '../../mocks/wallet';
import { TRANSFER_LIMIT, formatPeso, formatWhole } from '../../mocks/send';
import { colors, fonts } from '../../theme';
import { Mascot, type MascotMood } from '../mascot/Mascot';
import { InfoIcon } from '../ui/smallIcons';
import { SwipeToEnter } from '../ui/SwipeToEnter';
import { AmountField, amountProblem } from './AmountField';
import { BalanceBar } from './BalanceBar';
import { GlassCard } from './GlassCard';
import { SendLayout } from './SendLayout';

const FADE_MS = 250;
const BALANCES: Record<WalletKind, number> = { online: ONLINE_WALLET_BALANCE, offline: OFFLINE_WALLET_BALANCE };
const NAMES: Record<WalletKind, string> = { online: 'Online', offline: 'Offline' };

type TransferFormProps = {
  /** The wallet the money lands in; the other one is the source. */
  to: WalletKind;
  title: string;
  icon: React.ReactNode;
  mood: MascotMood;
  onBack: () => void;
  /** Called with the amount once the swipe completes. */
  onConfirm: (amount: number) => void;
};

/**
 * Shared body of "Transfer to Online" (870:3328) and "Transfer to Offline" (870:3307): move funds
 * between the user's own wallets. The amount card, the source-wallet note, Honi and the swipe.
 */
export function TransferForm({ to, title, icon, mood, onBack, onConfirm }: TransferFormProps) {
  const from: WalletKind = to === 'online' ? 'offline' : 'online';
  const [amountText, setAmountText] = useState('');

  const amount = Number(amountText) || 0;
  const available = BALANCES[from];
  const problem = amountProblem(amount, available);
  const valid = problem === null;
  // The bar shows how much of the user's combined funds sit in the receiving wallet afterwards.
  const destinationAfter = BALANCES[to] + (valid ? amount : 0);
  const total = BALANCES.online + BALANCES.offline;

  return (
    <SendLayout
      title={title}
      icon={icon}
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          <Mascot mood={mood} width={264} />
          <SwipeToEnter
            label="SWIPE TO  PROCEED"
            accessibilityLabel={valid ? `Swipe to transfer ${formatPeso(amount)}` : 'Swipe to proceed, enter a valid amount first'}
            disabled={!valid}
            onComplete={() => onConfirm(amount)}
          />
        </View>
      }
    >
      <GlassCard style={styles.card}>
        {/* Same height whether it is showing or not, so the card does not jump while typing. */}
        <View style={styles.problemSlot} accessibilityLiveRegion="polite">
          {problem ? (
            <Animated.Text key={problem} entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.problem}>
              {problem}
            </Animated.Text>
          ) : null}
        </View>

        <BalanceBar caption={`${NAMES[to]} Balance after: ₱${formatWhole(destinationAfter)}`} ratio={destinationAfter / total} />

        <AmountField value={amountText} onChangeText={setAmountText} />

        <View>
          <Text style={styles.hint}>
            Available Balance {NAMES[from]}: PHP {formatWhole(available)}
          </Text>
          <Text style={styles.hint}>Transfer Limit: PHP {formatWhole(TRANSFER_LIMIT)}</Text>
        </View>
      </GlassCard>

      <View style={styles.noteRow}>
        <InfoIcon color={colors.textMuted} />
        <Text style={styles.noteText}>You are transferring funds from your {NAMES[from].toLowerCase()} wallet</Text>
      </View>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  problemSlot: { minHeight: 15, alignItems: 'center', justifyContent: 'center' },
  problem: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral, textAlign: 'center' },
  hint: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  noteText: { flex: 1, fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  footer: { alignItems: 'center', gap: 20 },
});
