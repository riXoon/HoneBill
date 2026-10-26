import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AmountField, amountProblem } from '../components/send/AmountField';
import { Avatar } from '../components/send/Avatar';
import { BalanceBar } from '../components/send/BalanceBar';
import { GlassCard } from '../components/send/GlassCard';
import { OutlinedField } from '../components/send/OutlinedField';
import { SendLayout } from '../components/send/SendLayout';
import { InfoIcon, MoneyOutIcon, StarIcon } from '../components/ui/smallIcons';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import {
  AVAILABLE_BALANCE,
  NOTE_MAX,
  SERVICE_FEE,
  TRANSFER_LIMIT,
  findRecipientById,
  formatPeso,
  formatWhole,
} from '../mocks/send';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Send 2 - Amount (870:3271), 402x874.
const FADE_MS = 250;

export function SendAmountScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendAmount'>) {
  const recipient = findRecipientById(route.params.recipientId);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [favorite, setFavorite] = useState(recipient?.favorite ?? false);

  useEffect(() => {
    if (!recipient) navigation.goBack();
  }, [recipient, navigation]);
  if (!recipient) return null;

  const amount = Number(amountText) || 0;
  const balanceAfter = AVAILABLE_BALANCE - (amount > 0 ? amount + SERVICE_FEE : 0);

  const problem = amountProblem(amount, AVAILABLE_BALANCE - SERVICE_FEE);
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
          onComplete={() => navigation.navigate('SendVerification', { recipientId: recipient.id, amount, note: note.trim() })}
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
            onPress={() => setFavorite((f) => !f)}
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

        <BalanceBar caption={`Balance after: ₱${formatWhole(Math.max(0, balanceAfter))}`} ratio={balanceAfter / AVAILABLE_BALANCE} />

        <AmountField value={amountText} onChangeText={setAmountText} />

        <View>
          <Text style={styles.hint}>Available Balance: PHP {formatWhole(AVAILABLE_BALANCE)}</Text>
          <Text style={styles.hint}>Transfer Limit: PHP {formatWhole(TRANSFER_LIMIT)}</Text>
        </View>
      </GlassCard>

      <GlassCard style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <Text style={styles.noteLabel}>Note (Optional)</Text>
          <Text style={styles.noteLabel}>
            {note.length}/{NOTE_MAX}
          </Text>
        </View>
        <OutlinedField>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={NOTE_MAX}
            accessibilityLabel="Note, optional"
            style={styles.noteInput}
          />
        </OutlinedField>
      </GlassCard>

      <View style={styles.feeRow}>
        <InfoIcon color={colors.textMuted} />
        <Text style={styles.feeText}>Please note that a ₱{SERVICE_FEE.toFixed(2)} service fee will be deducted.</Text>
      </View>
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
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  feeText: { flex: 1, fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
});
