import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AmountField, amountProblem, parseAmount } from '../components/send/AmountField';
import { Avatar } from '../components/send/Avatar';
import { BalanceBar } from '../components/send/BalanceBar';
import { GlassCard } from '../components/send/GlassCard';
import { OutlinedField } from '../components/send/OutlinedField';
import { SendLayout } from '../components/send/SendLayout';
import { useFieldFocus } from '../components/ui/fieldState';
import { MoneyOutIcon, StarIcon } from '../components/ui/smallIcons';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import { NOTE_MAX } from '../config/limits';
import { useWalletData } from '../context/WalletDataContext';
import { OFFLINE_TOLL_PESOS } from '../config/limits';
import { useRecentRecipients } from '../hooks/useRecentRecipients';
import { useSendMode } from '../hooks/useSendMode';
import type { RootStackParamList } from '../navigation/types';
import { formatPeso, formatWhole } from '../utils/format';
import { findRecipientById } from '../services/recipientDirectory';
import { colors, fonts } from '../theme';

// Figma: Send 2 - Amount (870:3271), 402x874.
const FADE_MS = 250;

export function SendAmountScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendAmount'>) {
  const recipient = findRecipientById(route.params.recipientId);
  const { balances } = useWalletData();
  const online = useSendMode(route.params.mode) === 'online';
  const [amountText, setAmountText] = useState(route.params.amount ? route.params.amount.toFixed(2) : '');
  const [note, setNote] = useState('');
  const noteFocus = useFieldFocus();
  const { isFavorite, toggleFavorite } = useRecentRecipients();
  const favorite = recipient ? isFavorite(recipient.id) : false;

  useEffect(() => {
    if (!recipient) navigation.goBack();
  }, [recipient, navigation]);
  if (!recipient) return null;

  const amount = parseAmount(amountText);
  // The view this was started from decides: Online spends the online wallet and settles now; Offline spends the vault.
  const available = balances ? (online ? balances.online : balances.offline) : null;
  // An offline payment also costs the toll, which the vault pays on top of the amount.
  const fee = online ? 0 : OFFLINE_TOLL_PESOS;
  const balanceAfter = available === null ? null : available - (amount > 0 ? amount + fee : 0);

  // Without a balance read from the server there is nothing to check an amount against.
  const problem = available === null ? 'Balance unavailable' : amountProblem(amount, Math.max(0, available - fee));
  const valid = problem === null;

  return (
    <SendLayout
      title="Send"
      icon={<MoneyOutIcon />}
      onBack={navigation.goBack}
      gap={12}
      footer={
        <SwipeToEnter
          label="SWIPE TO  PROCEED"
          accessibilityLabel={valid ? `Swipe to proceed with ${formatPeso(amount)}` : 'Swipe to proceed, enter a valid amount first'}
          disabled={!valid}
          onComplete={() => navigation.navigate('SendVerification', { recipientId: recipient.id, amount, note: note.trim(), mode: route.params.mode })}
        />
      }
    >
      <GlassCard style={styles.card}>
        <View style={styles.avatar}>
          <Avatar initials={recipient.initials} color={recipient.color} ring />
        </View>

        <View style={styles.top}>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {recipient.name}
            </Text>
            <Text style={styles.provider} numberOfLines={1}>
              {recipient.provider}
            </Text>
            <Text style={styles.account} numberOfLines={1}>
              {recipient.account}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? `Remove ${recipient.name} from favorites` : `Add ${recipient.name} to favorites`}
            accessibilityState={{ selected: favorite }}
            hitSlop={6}
            onPress={() => void toggleFavorite(recipient)}
            style={styles.star}
          >
            <StarIcon filled={favorite} />
          </Pressable>
        </View>

        {/* The ID is locked to the chosen recipient, so it keeps the muted look of the design. */}
        <OutlinedField style={styles.idField}>
          <Text style={styles.idTag}>ID</Text>
          <Text style={styles.idValue} accessibilityLabel={`Short ID ${recipient.shortId}`}>
            {recipient.shortId}
          </Text>
        </OutlinedField>

        {/* Same height whether it is showing or not, so the card does not jump while typing. */}
        <View style={styles.problemSlot} accessibilityLiveRegion="polite">
          {problem ? (
            <Animated.Text key={problem} entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.problem}>
              {problem}
            </Animated.Text>
          ) : null}
        </View>

        <BalanceBar
          caption={`Balance after: ${balanceAfter === null ? '--' : `₱${formatWhole(Math.max(0, balanceAfter))}`}`}
          ratio={available && balanceAfter !== null ? balanceAfter / available : 0}
        />

        <AmountField value={amountText} onChangeText={setAmountText} />

        <View>
          <Text style={styles.hint}>Available Balance: PHP {available === null ? '--' : formatWhole(available)}</Text>
        </View>
      </GlassCard>

      <GlassCard style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <Text style={styles.noteLabel}>Note (Optional)</Text>
          <Text style={styles.noteLabel}>
            {note.length}/{NOTE_MAX}
          </Text>
        </View>
        <OutlinedField focused={noteFocus.focused} filled={note.length > 0}>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX}
            onFocus={noteFocus.onFocus}
            onBlur={noteFocus.onBlur}
            accessibilityLabel="Note, optional"
            style={styles.noteInput}
          />
        </OutlinedField>
      </GlassCard>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  // Centred on the card's top edge: 40 dp disc, half of it over the gap above.
  avatar: { position: 'absolute', top: -20, left: 0, right: 0, alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  provider: { fontFamily: fonts.light, fontSize: 7, color: colors.textMuted },
  account: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  star: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  idField: { gap: 17 },
  idTag: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  idValue: { fontFamily: fonts.regular, fontSize: 16, color: 'rgba(34, 32, 33, 0.2)' },
  problemSlot: { minHeight: 15, alignItems: 'center', justifyContent: 'center' },
  problem: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral, textAlign: 'center' },
  hint: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted },
  noteCard: { padding: 16, gap: 10 },
  noteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteLabel: { fontFamily: fonts.regular, fontSize: 7, color: colors.textMuted },
  noteInput: { flex: 1, padding: 0, fontFamily: fonts.regular, fontSize: 12, color: colors.text },
});
