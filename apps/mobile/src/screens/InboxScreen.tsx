import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '../components/home/ActivityRow';
import { AppBackground } from '../components/ui/AppBackground';
import { EmptyState } from '../components/ui/EmptyState';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { FilterChips } from '../components/ui/FilterChips';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { InboxIcon } from '../components/ui/navIcons';
import { BANNER_HONI, PromoBanner } from '../components/ui/PromoBanner';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { greetingName, useAuth } from '../context/AuthContext';
import { useInbox } from '../hooks/useInbox';
import type { RootStackParamList } from '../navigation/types';
import { markUpdateRead } from '../services/appUpdates';
import { INBOX_FILTERS, filterInbox } from '../types/inbox';
import type { InboxFilter, InboxItem } from '../types/inbox';
import { colors, fonts } from '../theme';

// Figma: Inbox (870:3123), 402x874.
const keyExtractor = (item: InboxItem) => item.id;
const Separator = () => <View style={styles.separator} />;

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InboxFilter>('All');
  const slide = useFilterSlide(INBOX_FILTERS.indexOf(filter));
  const { activeAccount } = useAuth();
  const { items: all } = useInbox();
  const items = useMemo(() => filterInbox(all, filter), [all, filter]);
  const navigation = useNavigation();

  /** An update notice opens that version's notes, or the download page of a newer app. */
  const open = useCallback(
    (item: InboxItem) => {
      void markUpdateRead(item.id);
      const target = item.update;
      if (!target) return;
      if (target.type === 'notes') {
        // The tabs live inside the root stack, so the notes screen is opened from the parent navigator.
        navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('WhatsNew', { version: target.version });
      } else if (target.url) {
        void Linking.openURL(target.url).catch(() => Alert.alert('Could not open the download', target.url ?? ''));
      } else {
        Alert.alert('Update available', 'Ask HoneBill support for the download link of the new version.');
      }
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) => (
      <SlideRow>
        <Pressable
          accessibilityRole={item.update ? 'button' : undefined}
          accessibilityLabel={`${item.unread ? 'Unread. ' : ''}${item.title}. ${item.body}`}
          disabled={!item.update}
          onPress={() => open(item)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ActivityRow kind={item.kind} title={item.title} body={item.body} time={item.time} unread={item.unread} />
        </Pressable>
      </SlideRow>
    ),
    [open],
  );

  const header = (
    <View style={styles.header}>
      <ScreenHeader icon={<InboxIcon color={colors.coral} size={40} />} title="Inbox" />
      <PromoBanner
        title={`Hello, ${greetingName(activeAccount)}!`}
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
            <EmptyState message={'Nothing to see here!\nYour updates will land here.'} />
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
  pressed: { opacity: 0.7 },
  sectionTitle: { minHeight: 30, justifyContent: 'center' },
  sectionText: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
});
