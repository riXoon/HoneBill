import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '../components/home/ActivityRow';
import { AppBackground } from '../components/ui/AppBackground';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { FilterChips } from '../components/ui/FilterChips';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { InboxIcon } from '../components/ui/navIcons';
import { BANNER_HONI, PromoBanner } from '../components/ui/PromoBanner';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { mockProfile } from '../mocks/profile';
import { INBOX_FILTERS, filterInbox, mockInbox } from '../mocks/inbox';
import type { InboxFilter, InboxItem } from '../mocks/inbox';
import { colors, fonts } from '../theme';

// Figma: Inbox (870:3123), 402x874.
const renderItem = ({ item }: { item: InboxItem }) => (
  <SlideRow>
    <ActivityRow kind={item.kind} title={item.title} body={item.body} time={item.time} />
  </SlideRow>
);
const keyExtractor = (item: InboxItem) => item.id;
const Separator = () => <View style={styles.separator} />;

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>('All');
  const slide = useFilterSlide(INBOX_FILTERS.indexOf(filter));
  const items = useMemo(() => filterInbox(mockInbox.items, filter), [filter]);

  const header = (
    <View style={styles.header}>
      <ScreenHeader icon={<InboxIcon color={colors.coral} size={40} />} title="Inbox" />
      <PromoBanner
        title={`Hello, ${mockProfile.greetingName}!`}
        subtitle="Check your updates here"
        honi={BANNER_HONI.inbox}
      />
      <FilterChips options={INBOX_FILTERS} value={filter} onChange={setFilter} />
      <View style={styles.sectionTitle}>
        <Text style={styles.sectionText}>Latest</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <AppBackground />
      <FilterSlideProvider offset={slide}>
      <FlatList
        data={items}
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
  header: { gap: 20, marginBottom: 10 },
  separator: { height: 10 },
  sectionTitle: { minHeight: 30, justifyContent: 'center' },
  sectionText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  empty: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(34, 32, 33, 0.2)' },
});
