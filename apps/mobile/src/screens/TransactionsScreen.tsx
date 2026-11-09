import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateDivider } from '../components/history/DateDivider';
import { TransactionCard } from '../components/history/TransactionCard';
import { AppBackground } from '../components/ui/AppBackground';
import { EmptyState } from '../components/ui/EmptyState';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { FilterChips } from '../components/ui/FilterChips';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { HistoryIcon } from '../components/ui/navIcons';
import { BANNER_HONI, PromoBanner } from '../components/ui/PromoBanner';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { greetingName, useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { TRANSACTION_FILTERS, buildHistoryRows } from '../types/transaction';
import type { HistoryRow, TransactionFilter } from '../types/transaction';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

// Figma: Transactions (870:3169), 402x874. Reached from the "History" tab.
const keyExtractor = (item: HistoryRow) => item.id;
const Separator = () => <View style={styles.separator} />;

export function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const openDetail = useCallback((id: string) => navigation.navigate('TransactionDetail', { id }), [navigation]);
  const renderItem = useCallback(
    ({ item }: { item: HistoryRow }) => (
      <SlideRow>{item.type === 'date' ? <DateDivider label={item.label} /> : <TransactionCard tx={item.tx} onPress={openDetail} />}</SlideRow>
    ),
    [openDetail],
  );
  const [filter, setFilter] = useState<TransactionFilter>('All');
  const slide = useFilterSlide(TRANSACTION_FILTERS.indexOf(filter));
  const { activeAccount } = useAuth();
  const { transactions, status, error, refresh } = useWalletData();
  const rows = useMemo(() => buildHistoryRows(transactions, filter), [transactions, filter]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const header = (
    <View style={styles.header}>
      <ScreenHeader icon={<HistoryIcon color={colors.coral} size={40} />} title="Transactions" />
      <PromoBanner
        title={`Hello, ${greetingName(activeAccount)}!`}
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
            <EmptyState
              loading={status === 'loading' || status === 'idle'}
              message={error ?? undefined}
              isError={Boolean(error)}
            />
          </SlideRow>
        }
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading'}
            onRefresh={() => void refresh({ force: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
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
});
