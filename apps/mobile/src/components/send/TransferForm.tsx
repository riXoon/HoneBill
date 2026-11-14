import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useWalletData } from '../../context/WalletDataContext';
import { colors, fonts } from '../../theme';
import { formatPeso, formatWhole } from '../../utils/format';
import { Mascot, type MascotMood } from '../mascot/Mascot';
import { ResultDialog, type ResultDialogProps } from '../ui/ResultDialog';
import { InfoIcon } from '../ui/smallIcons';
import { SwipeToEnter } from '../ui/SwipeToEnter';
import { AmountField, amountProblem, parseAmount } from './AmountField';
import { BalanceBar } from './BalanceBar';
import { GlassCard } from './GlassCard';
import { SendLayout } from './SendLayout';

const FADE_MS = 250;
export type WalletKind = 'online' | 'offline';
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
  /** The transfer is being signed and submitted: the amount is locked and the swipe disabled. */
  busy?: boolean;
  /** The success / failure dialog shown once the transfer finishes. */
  dialog: ResultDialogProps;
};

/**
 * Shared body of "Transfer to Online" (870:3328) and "Transfer to Offline" (870:3307): move funds
 * between the user's own wallets. The amount card, the source-wallet note, Honi and the swipe.
 */
export function TransferForm({ to, title, icon, mood, onBack, onConfirm, busy = false, dialog }: TransferFormProps) {
  const from: WalletKind = to === 'online' ? 'offline' : 'online';
  const [amountText, setAmountText] = useState('');

  const { balances, pendingOffline } = useWalletData();

  const amount = parseAmount(amountText);
  // Moving money out of the vault must leave what pending vouchers will take, or those vouchers fail when they settle.
  const available = balances ? (from === 'offline' ? Math.max(0, balances.offline - pendingOffline) : balances[from]) : null;
  // Without balances read from the server there is nothing to check an amount against.
  const problem = available === null ? 'Balance unavailable' : amountProblem(amount, available);
  const valid = problem === null;
  // The bar shows how much of the user's combined funds sit in the receiving wallet afterwards.
  const destinationAfter = balances ? balances[to] + (valid ? amount : 0) : null;
  const total = balances ? balances.online + balances.offline : 0;

  return (
    <SendLayout
      title={title}
      icon={icon}
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          <Mascot mood={mood} width={264} />
          <SwipeToEnter
            label={busy ? 'TRANSFERRING…' : 'SWIPE TO  PROCEED'}
            accessibilityLabel={
              busy
                ? `Transferring ${formatPeso(amount)}, please wait`
                : valid
                  ? `Swipe to transfer ${formatPeso(amount)}`
                  : 'Swipe to proceed, enter a valid amount first'
            }
            disabled={!valid || busy}
            busy={busy}
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

        <BalanceBar
          caption={`${NAMES[to]} Balance after: ${destinationAfter === null ? '--' : `₱${formatWhole(destinationAfter)}`}`}
          ratio={destinationAfter !== null && total > 0 ? destinationAfter / total : 0}
        />

        <AmountField value={amountText} onChangeText={busy ? () => undefined : setAmountText} />

        <View>
          <Text style={styles.hint}>
            Available Balance {NAMES[from]}: PHP {available === null ? '--' : formatWhole(available)}
          </Text>
        </View>
      </GlassCard>

      <View style={styles.noteRow}>
        <InfoIcon color={colors.textMuted} />
        <Text style={styles.noteText}>You are transferring funds from your {NAMES[from].toLowerCase()} wallet</Text>
      </View>

      <ResultDialog {...dialog} />
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
