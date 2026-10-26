import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SOURCE_LABEL, type Transaction } from '../../mocks/transactions';
import { splitPesos } from '../../mocks/home';
import { colors, fonts } from '../../theme';
import { OfflineFundsBadge } from '../ui/smallIcons';

/** Figma "Content" card (870:3181): source pill and time, description, signed amount. */
export const TransactionCard = memo(function TransactionCard({ tx }: { tx: Transaction }) {
  const sign = tx.direction === 'in' ? '+' : '-';
  const amount = `${sign} ₱${splitPesos(tx.amount).whole}`;
  return (
    <View style={styles.card} accessible accessibilityLabel={`${SOURCE_LABEL[tx.source]}, ${tx.time}. ${tx.description}. ${amount}`}>
      <View style={styles.status}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{SOURCE_LABEL[tx.source]}</Text>
        </View>
        <Text style={styles.time}>{tx.time}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.text}>
          <Text style={styles.description}>{tx.description}</Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>
        {tx.source === 'offline' ? <OfflineFundsBadge /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 16,
    borderRadius: 10,
    // Figma fills this 50% white over the page. A translucent fill lets the drop shadow show through
    // (iOS) or draws a grey outline (Android elevation), which Figma does not do, so use the flattened
    // colour: #F7F7FB at 50% over #ECF0F3.
    backgroundColor: '#F2F4F7',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 1,
  },
  status: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.text },
  pillText: { fontFamily: fonts.regular, fontSize: 8, lineHeight: 10, includeFontPadding: false, color: colors.surface, textAlign: 'center' },
  time: { fontFamily: fonts.regular, fontSize: 8, lineHeight: 10, includeFontPadding: false, color: colors.textMuted, textTransform: 'uppercase' },
  info: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 10 },
  text: { flex: 1, gap: 8, justifyContent: 'center', paddingHorizontal: 10 },
  description: { fontFamily: fonts.extraLight, fontSize: 10, lineHeight: 13, includeFontPadding: false, color: colors.text },
  amount: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 20, includeFontPadding: false, color: colors.text },
});
