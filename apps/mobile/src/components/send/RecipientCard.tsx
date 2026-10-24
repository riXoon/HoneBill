import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Recipient } from '../../mocks/send';
import { colors, fonts } from '../../theme';
import { StarIcon } from '../ui/smallIcons';
import { Avatar } from './Avatar';

/** Three cards fit the 342 dp row with 10 dp gaps (Figma "recipient-box"). */
export const RECIPIENT_CARD_WIDTH = (342 - 20) / 3;

type RecipientCardProps = {
  recipient: Recipient;
  favorite: boolean;
  onPress: (recipient: Recipient) => void;
  onToggleFavorite: (recipient: Recipient) => void;
};

/** Figma "recipient-box" (764:3260): star, avatar, then name, provider and account, 136 dp tall. */
export function RecipientCard({ recipient, favorite, onPress, onToggleFavorite }: RecipientCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Send to ${recipient.name}, ${recipient.provider}, ${recipient.account}`}
      onPress={() => onPress(recipient)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.starRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? `Remove ${recipient.name} from favorites` : `Add ${recipient.name} to favorites`}
          accessibilityState={{ selected: favorite }}
          hitSlop={6}
          onPress={() => onToggleFavorite(recipient)}
          style={styles.star}
        >
          <StarIcon filled={favorite} />
        </Pressable>
      </View>
      <Avatar initials={recipient.initials} color={recipient.color} />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {recipient.name}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {recipient.provider}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {recipient.account}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: RECIPIENT_CARD_WIDTH,
    height: 136,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  // The 16 dp row centres the 24 dp touch target on the star, which is why the star sits 20 dp from the card top.
  starRow: { width: '100%', height: 16, alignItems: 'flex-end', justifyContent: 'center' },
  star: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  info: { width: '100%', gap: 2 },
  name: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  detail: { fontFamily: fonts.light, fontSize: 7, color: colors.textMuted },
});
