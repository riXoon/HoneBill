import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '../components/home/ActivityRow';
import { BalanceCards } from '../components/home/BalanceCards';
import type { BalanceMode } from '../components/home/BalanceCards';
import { QuickActions, type QuickActionKey } from '../components/home/QuickActions';
import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { EMPTY_TRANSACTIONS_MESSAGE } from '../components/ui/EmptyState';
import { SpeechBubble } from '../components/ui/SpeechBubble';
import { useLoadingMessage } from '../hooks/useLoadingMessage';
import { ProfileIcon } from '../components/ui/navIcons';
import { fullName, greetingName, useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';
import { SOURCE_LABEL } from '../types/transaction';
import { formatAmount, formatRelative } from '../utils/format';

/** How many entries "Recent Activity" shows; the full list is on the History tab. */
const RECENT_COUNT = 3;

// Figma: Home Page - Online (870:3102) and Home Page - Offline (870:3140), 402x874.
const FADE_MS = 250;
const QUICK_ACTION_ROUTE = {
  send: 'SendTo',
  receive: 'ReceiveAmount',
  online: 'TransferOnline',
  offline: 'TransferOffline',
} as const satisfies Partial<Record<QuickActionKey, keyof RootStackParamList>>;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeAccount } = useAuth();
  const { balances, transactions, status, error, refresh } = useWalletData();
  // Tapping the cards switches the view. It is not tied to connectivity yet (that needs a NetInfo hookup).
  const [mode, setMode] = useState<BalanceMode>('online');
  const online = mode === 'online';
  const toggle = () => setMode((m) => (m === 'online' ? 'offline' : 'online'));

  // Pick up changes made since the last visit (a settled transfer, a top-up); skipped while the data is fresh.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const recent = transactions.slice(0, RECENT_COUNT);
  // Honi rests above the nav bar when there is nothing to list (offline, or no activity yet) and keeps the user
  // company during the first load, with a speech bubble that chats instead of a plain "Loading…".
  const showRestHoni = !online || recent.length === 0;
  const loadingFirst = recent.length === 0 && (status === 'loading' || status === 'idle');
  const chatter = useLoadingMessage(loadingFirst);

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(70, insets.top + 24), paddingBottom: NAV_BAR_HEIGHT + Math.max(24, insets.bottom) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading'}
            onRefresh={() => void refresh({ force: true })}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Online: Honi peeks in from the top right, tilted -20.87 degrees, behind the cards. */}
        {online && !showRestHoni ? (
          <Animated.View
            entering={FadeIn.duration(FADE_MS)}
            exiting={FadeOut.duration(FADE_MS)}
            pointerEvents="none"
            style={styles.honiPeek}
          >
            <Mascot mood="idlePlain" />
          </Animated.View>
        ) : null}

        <View style={styles.topBar}>
          <ProfileIcon color={colors.coral} size={48} />
          <View style={styles.topText}>
            <Text style={styles.hello}>Hello, {fullName(activeAccount) || greetingName(activeAccount)}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: online ? colors.statusOnline : colors.statusOffline }]} />
              <Text style={styles.status}>{online ? 'You are online' : 'You are offline'}</Text>
            </View>
          </View>
        </View>

        <BalanceCards
          mode={mode}
          onlineBalance={balances?.online ?? null}
          offlineBalance={balances?.offline ?? null}
          status={status}
          onToggle={toggle}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {balances ? 'Could not refresh. Pull down to try again.' : error}
          </Text>
        ) : null}

        <QuickActions online={online} onPress={(key) => {
            // Top-up has no screen yet.
            if (key !== 'topup') navigation.navigate(QUICK_ACTION_ROUTE[key]);
          }}
        />

        <View style={styles.activity}>
          {online ? (
            <Animated.View entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.activityBlock}>
              <View style={styles.activityTitle}>
                <Text style={styles.activityHeading}>Recent Activity</Text>
                {/* Nothing to see yet, and the bubble above Honi needs that corner. */}
                {recent.length === 0 ? null : (
                  <Text style={styles.seeAll} accessibilityRole="button">
                    See All
                  </Text>
                )}
              </View>
              {recent.length === 0 ? (
                // The message (loading chatter or "nothing here") is Honi's speech bubble, in his layer below.
                null
              ) : (
                <View style={styles.activityList}>
                  {recent.map((tx) => (
                    <ActivityRow
                      key={tx.id}
                      kind={tx.direction === 'in' ? 'received' : 'sent'}
                      title={tx.description}
                      body={`${tx.direction === 'in' ? '+' : '-'} ${formatAmount(tx.amount, tx.assetCode)} · ${SOURCE_LABEL[tx.source]}`}
                      time={formatRelative(new Date(tx.timestamp))}
                    />
                  ))}
                </View>
              )}
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(FADE_MS)} exiting={FadeOut.duration(FADE_MS)} style={styles.activityBlock}>
              <Text style={styles.activityHeading}>Recent Activity</Text>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      {/* Empty activity (offline, or online with nothing yet): Honi sits above the nav bar, centred. */}
      {showRestHoni ? (
        <Animated.View
          entering={FadeIn.duration(FADE_MS)}
          exiting={FadeOut.duration(FADE_MS)}
          pointerEvents="none"
          style={[styles.honiRest, { bottom: 98.5 + Math.max(0, insets.bottom - 24) }]}
        >
          <Mascot mood="idlePlain" />
          {/* In Honi's layer so it is drawn over him, not under: its tail points at his head, between the heading and the antennae. */}
          <View style={styles.honiBubble}>
            <SpeechBubble message={loadingFirst ? chatter : EMPTY_TRANSACTIONS_MESSAGE} delay={450} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', gap: 20, paddingHorizontal: 30 },
  // Centre (354, 130) in a 402 dp frame; the image is 347x227.
  honiPeek: { position: 'absolute', left: 180.5, top: 16.5, transform: [{ rotate: '-20.87deg' }] },
  honiRest: { position: 'absolute', alignSelf: 'center' },
  // Anchored by its bottom edge (the tail) 31 dp below the top of Honi's 224 dp box, so a longer message grows
  // upward, away from his head. Nudged right to keep clear of the "Recent Activity" heading.
  honiBubble: { position: 'absolute', bottom: 193, left: 0, right: 0, paddingLeft: 80, alignItems: 'center' },
  topBar: { width: 342, height: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topText: { flex: 1, gap: 4, padding: 10 },
  hello: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontFamily: fonts.light, fontSize: 14, color: colors.text },
  activity: { width: 342, minHeight: 200 },
  activityBlock: { width: '100%', gap: 10 },
  activityTitle: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activityHeading: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  seeAll: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  activityList: { gap: 10 },
  error: { width: 342, fontFamily: fonts.regular, fontSize: 11, color: colors.coral, textAlign: 'center' },
});
