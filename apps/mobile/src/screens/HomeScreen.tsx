import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { ConnectivityNoticeDialog } from '../components/ui/ConnectivityNoticeDialog';
import { EMPTY_TRANSACTIONS_MESSAGE } from '../components/ui/EmptyState';
import { SpeechBubble } from '../components/ui/SpeechBubble';
import { useLoadingMessage } from '../hooks/useLoadingMessage';
import { useOfflineSetup } from '../hooks/useOfflineSetup';
import { ProfileIcon } from '../components/ui/navIcons';
import { ShortIdBadge } from '../components/send/ShortIdBadge';
import { fullName, greetingName, useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { useIsOnline } from '../hooks/useIsOnline';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';
import { useScale } from '../theme/responsive';
import { SOURCE_LABEL } from '../types/transaction';
import { formatAmount, formatRelative } from '../utils/format';

/** How many entries "Recent Activity" shows; the full list is on the History tab. */
const RECENT_COUNT = 3;

// Figma: Home Page - Online (870:3102) and Home Page - Offline (870:3140), 402x874.
const FADE_MS = 250;
const QUICK_ACTION_ROUTE = {
  send: 'SendTo',
  receive: 'ReceiveQr',
  topup: 'TopUp',
  online: 'TransferOnline',
  offline: 'TransferOffline',
} as const satisfies Partial<Record<QuickActionKey, keyof RootStackParamList>>;
/** Actions that talk to the server or the chain. Offline Send (SMS voucher) and Receive (showing a QR) work without it. */
const NEEDS_INTERNET: ReadonlySet<QuickActionKey> = new Set(['topup', 'online', 'offline']);
/** Honi's resting box, the height of the "Recent Activity" heading row, and how far above his box the bubble can reach
 *  (3 lines + tail, less the 31 dp it overlaps him) plus a gap. */
const HONI_BOX_HEIGHT = 224;
const ACTIVITY_TITLE_HEIGHT = 30;
const BUBBLE_CLEARANCE = 62;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeAccount } = useAuth();
  const { balances, transactions, status, error, refresh, syncNow } = useWalletData();
  useOfflineSetup();
  const connected = useIsOnline();
  // Tapping the cards switches the view, and the view decides which funds Send spends. Losing the connection moves to
  // Offline (the only view that can pay); getting it back leaves the choice to the user. While offline, the Online view
  // and anything else that needs the internet is refused with a notice instead.
  const [mode, setMode] = useState<BalanceMode>('online');
  const [offlineNotice, setOfflineNotice] = useState(false);
  useEffect(() => {
    if (!connected) setMode('offline');
    // The notice is about the connection being gone; once it is back there is nothing left to explain.
    else setOfflineNotice(false);
  }, [connected]);
  const online = mode === 'online';
  const toggle = () => {
    if (mode === 'offline' && !connected) {
      setOfflineNotice(true);
      return;
    }
    setMode((m) => (m === 'online' ? 'offline' : 'online'));
  };
  const onQuickAction = (key: QuickActionKey) => {
    if (NEEDS_INTERNET.has(key) && !connected) {
      setOfflineNotice(true);
      return;
    }
    if (key === 'send') navigation.navigate('SendTo', { mode });
    else navigation.navigate(QUICK_ACTION_ROUTE[key]);
  };

  // Pick up changes made since the last visit (a settled transfer, a top-up); skipped while the data is fresh.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Each view lists its own money: Online shows the wallet's activity, Offline shows the offline funds' (payments,
  // including ones sent from this phone that are not settled yet, and moves to and from the online balance).
  const recent = useMemo(
    () => transactions.filter((tx) => tx.source === (online ? 'wallet' : 'offline')).slice(0, RECENT_COUNT),
    [online, transactions],
  );
  // Honi rests above the nav bar when there is nothing to list in the current view and keeps the user
  // company during the first load, with a speech bubble that chats instead of a plain "Loading…".
  const showRestHoni = recent.length === 0;
  const loadingFirst = recent.length === 0 && (status === 'loading' || status === 'idle');
  const chatter = useLoadingMessage(loadingFirst);

  // Where Honi's box starts, in scroll-content coordinates. Ideally he rests just above the nav bar, but his bubble
  // grows upward (up to ~3 lines), so he never rises above the point where the bubble would touch the buttons or the
  // "Recent Activity" heading; on a short screen the page grows and scrolls instead.
  const { height: windowHeight } = useWindowDimensions();
  const [activityY, setActivityY] = useState(0);
  const contentPaddingBottom = NAV_BAR_HEIGHT + Math.max(24, insets.bottom) + 20;
  // Honi (and so his box and the bubble's anchor) shrinks on a smaller phone.
  const scale = useScale();
  const honiBoxHeight = HONI_BOX_HEIGHT * scale;
  const restTop = windowHeight - (98.5 + Math.max(0, insets.bottom - 24)) - honiBoxHeight;
  const honiTop = Math.max(restTop, activityY + ACTIVITY_TITLE_HEIGHT + BUBBLE_CLEARANCE);

  return (
    <View style={styles.root}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(70, insets.top + 24),
            paddingBottom: contentPaddingBottom,
            minHeight: showRestHoni ? honiTop + honiBoxHeight + contentPaddingBottom : undefined,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading'}
            onRefresh={syncNow}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Once the current view has activity (Online or Offline), Honi peeks in from the top right, tilted -20.87 degrees, behind the cards. */}
        {!showRestHoni ? (
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
            {activeAccount?.shortId ? <ShortIdBadge compact shortId={activeAccount.shortId} /> : null}
            {/* The connection, not the selected card: viewing the Offline Balance while connected is still online. */}
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: connected ? colors.statusOnline : colors.statusOffline }]} />
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {connected ? 'You are online' : 'You are offline'}
              </Text>
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

        <QuickActions online={online} onPress={onQuickAction} />

        <View style={styles.activity} onLayout={(e) => setActivityY(e.nativeEvent.layout.y)}>
          <Animated.View
            key={mode}
            entering={FadeIn.duration(FADE_MS)}
            exiting={FadeOut.duration(FADE_MS)}
            style={styles.activityBlock}
          >
            <View style={styles.activityTitle}>
              <Text style={styles.activityHeading}>Recent Activity</Text>
              {/* Nothing to see yet, and the bubble above Honi needs that corner. */}
              {recent.length === 0 ? null : (
                <Text style={styles.seeAll} accessibilityRole="button">
                  See All
                </Text>
              )}
            </View>
            {recent.length === 0 ? null : (
              // With nothing to list, the message (loading chatter or "nothing here") is Honi's speech bubble, below.
              <View style={styles.activityList}>
                {recent.map((tx) => (
                  <ActivityRow
                    key={tx.id}
                    kind={tx.direction === 'in' ? 'received' : 'sent'}
                    title={tx.description}
                    body={`${tx.direction === 'in' ? '+' : '-'} ${formatAmount(tx.amount, tx.assetCode)} · ${SOURCE_LABEL[tx.source]}${tx.status === 'pending' ? ' · Pending' : ''}`}
                    time={formatRelative(new Date(tx.timestamp))}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </View>

        {/* Empty activity (offline, or online with nothing yet): Honi rests above the nav bar, centred. He lives in the
            scroll content so that on a short screen the page scrolls instead of his bubble covering the buttons. */}
        {showRestHoni ? (
          <Animated.View
            entering={FadeIn.duration(FADE_MS)}
            exiting={FadeOut.duration(FADE_MS)}
            pointerEvents="none"
            style={[styles.honiRest, { top: honiTop }]}
          >
            <Mascot mood="idlePlain" />
            {/* In Honi's layer so it is drawn over him, not under: its tail points at his head, between the heading and the antennae. */}
            <View style={[styles.honiBubble, { bottom: 193 * scale }]}>
              <SpeechBubble message={loadingFirst ? chatter : EMPTY_TRANSACTIONS_MESSAGE} delay={450} />
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <ConnectivityNoticeDialog notice={offlineNotice ? 'offline' : null} onDismiss={() => setOfflineNotice(false)} />
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
  honiBubble: { position: 'absolute', left: 0, right: 0, paddingLeft: 80, alignItems: 'center' },
  topBar: { width: '100%', maxWidth: 342, height: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topText: { flex: 1, gap: 4, padding: 10 },
  hello: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontFamily: fonts.light, fontSize: 14, color: colors.text },
  activity: { width: '100%', maxWidth: 342, minHeight: 200 },
  activityBlock: { width: '100%', gap: 10 },
  activityTitle: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activityHeading: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  seeAll: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  activityList: { gap: 10 },
  error: { width: '100%', maxWidth: 342, fontFamily: fonts.regular, fontSize: 11, color: colors.coral, textAlign: 'center' },
});
