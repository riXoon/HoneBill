import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateDivider } from '../components/history/DateDivider';
import { TransactionCard } from '../components/history/TransactionCard';
import { AppBackground } from '../components/ui/AppBackground';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { FilterChips } from '../components/ui/FilterChips';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { HistoryIcon } from '../components/ui/navIcons';
import { BANNER_HONI, PromoBanner } from '../components/ui/PromoBanner';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { TRANSACTION_FILTERS, buildHistoryRows, mockTransactions } from '../mocks/transactions';
import type { HistoryRow, TransactionFilter } from '../mocks/transactions';
import { mockProfile } from '../mocks/profile';
import { colors, fonts } from '../theme';

// Figma: Transactions (870:3169), 402x874. Reached from the "History" tab.
const renderItem = ({ item }: { item: HistoryRow }) => (
  <SlideRow>{item.type === 'date' ? <DateDivider label={item.label} /> : <TransactionCard tx={item.tx} />}</SlideRow>
);
const keyExtractor = (item: HistoryRow) => item.id;
const Separator = () => <View style={styles.separator} />;

export function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TransactionFilter>('All');
  const slide = useFilterSlide(TRANSACTION_FILTERS.indexOf(filter));
  const rows = useMemo(() => buildHistoryRows(mockTransactions, filter), [filter]);

  const header = (
    <View style={styles.header}>
      <ScreenHeader icon={<HistoryIcon color={colors.coral} size={40} />} title="Transactions" />
      <PromoBanner
        title={`Hello, ${mockProfile.greetingName}!`}
        subtitle={'Check your transaction\nhistory here'}
        honi={BANNER_HONI.transactions}
      />
      <FilterChips options={TRANSACTION_FILTERS} value={filter} onChange={setFilter} />
    </View>
  );

  return (
    <View style={styles.root}>
      <AppBackground />
      <FilterSlideProvider offset={slide}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <SlideRow>
            <Text style={styles.empty}>Nothing to see here!</Text>
          </SlideRow>
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(70, insets.top + 24), paddingBottom: NAV_BAR_HEIGHT + Math.max(24, insets.bottom) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      />
      </FilterSlideProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 30 },
  header: { gap: 20, marginBottom: 20 },
  separator: { height: 10 },
  empty: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(34, 32, 33, 0.2)' },
});
