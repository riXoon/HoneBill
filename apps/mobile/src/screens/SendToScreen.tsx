import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { OutlinedField } from '../components/send/OutlinedField';
import { RecipientCard } from '../components/send/RecipientCard';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { ComingSoonDialog } from '../components/ui/ComingSoonDialog';
import { Notice } from '../components/ui/Notice';
import { useFieldFocus } from '../components/ui/fieldState';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { AddBoxIcon, BankIcon, ContactCardIcon, MoneyOutIcon, QrTitleIcon } from '../components/ui/smallIcons';
import { SHORT_ID_LENGTH } from '../config/limits';
import { SEND_METHODS, type SendMethodKey } from '../config/sendMethods';
import { useAuth } from '../context/AuthContext';
import { useIsOnline } from '../hooks/useIsOnline';
import { useRecentRecipients } from '../hooks/useRecentRecipients';
import { useSendMode } from '../hooks/useSendMode';
import type { RootStackParamList } from '../navigation/types';
import type { Recipient } from '../types/recipient';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { findRecipientById, resolveRecipient, unverifiedRecipient } from '../services/recipientDirectory';
import { colors, fonts } from '../theme';

// Figma: Send 1 - To (870:3195), 402x874.
const TABS = ['Recent', 'Favorites'] as const;
type Tab = (typeof TABS)[number];

export function SendToScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SendTo'>) {
  const { activeAccount } = useAuth();
  const [shortId, setShortId] = useState('');
  const idFocus = useFieldFocus();
  const [invalid, setInvalid] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /** True while the complete ID is being looked up, so a slow network does not look like nothing happened. */
  const [checking, setChecking] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  /** A complete ID that could not be checked because there is no connection; the user may still pay it by voucher. */
  const [unverifiedId, setUnverifiedId] = useState<string | null>(null);
  const connected = useIsOnline();
  // No connection (or Send opened from the Offline view) means this payment is an offline voucher.
  const offlineSend = useSendMode(route.params?.mode) === 'offline';

  useEffect(() => () => lookup.current?.abort(), []);
  const [method, setMethod] = useState<SendMethodKey>('honebill');
  /** The rail the user tapped that is not open yet, shown in the notice dialog. */
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Recent');
  const { recents, favorites, isFavorite, toggleFavorite } = useRecentRecipients();
  const slide = useFilterSlide(TABS.indexOf(tab));

  const recipients = tab === 'Recent' ? recents : favorites;

  const goToAmount = (recipient: Recipient) => {
    Keyboard.dismiss();
    // An unchecked ID can only be paid by voucher, even if the connection comes back on a later step.
    const mode = recipient.unverified ? 'offline' : route.params?.mode;
    navigation.navigate('SendAmount', { recipientId: recipient.id, mode });
  };

  /** Without a connection: a recipient already known on this phone goes straight through, any other ID gets the warning. */
  const offerUnverified = (id: string) => {
    const known = findRecipientById(id);
    if (known && !known.unverified) goToAmount(known);
    else setUnverifiedId(id);
  };

  const lookupRecipient = async (id: string) => {
    if (id === activeAccount?.shortId) {
      setInvalid(true);
      setLookupError("You can't send to yourself.");
      return;
    }
    if (!connected) {
      if (offlineSend) offerUnverified(id);
      else setLookupError('No internet connection, so this ID cannot be checked. Connect, or send offline instead.');
      return;
    }
    const controller = new AbortController();
    lookup.current = controller;
    setChecking(true);
    try {
      const found = await resolveRecipient(id, controller.signal);
      if (found) goToAmount(found);
      else {
        setInvalid(true);
        setLookupError('No account found for this ID.');
      }
    } catch (e) {
      if (isAborted(e)) return;
      // The phone looked connected but the request never got through (weak signal): treat it as offline.
      const unreachable = e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout');
      if (unreachable && offlineSend) offerUnverified(id);
      else setLookupError(errorMessage(e));
    } finally {
      // A newer lookup owns the flag now; only the latest one may clear it.
      if (lookup.current === controller) setChecking(false);
    }
  };

  const onChangeId = (text: string) => {
    // Short IDs are case-sensitive, so keep what the user typed.
    const next = text.replace(/[^a-zA-Z0-9]/g, '').slice(0, SHORT_ID_LENGTH);
    setShortId(next);
    setInvalid(false);
    setLookupError(null);
    setUnverifiedId(null);
    lookup.current?.abort();
    setChecking(false);
    // The short ID has a fixed length, so resolve it as soon as it is complete.
    if (next.length === SHORT_ID_LENGTH) void lookupRecipient(next);
  };

  // When the connection comes back, an ID that could not be checked is checked now.
  const wasConnected = useRef(connected);
  useEffect(() => {
    const reconnected = connected && !wasConnected.current;
    wasConnected.current = connected;
    if (!reconnected || shortId.length !== SHORT_ID_LENGTH || (unverifiedId === null && lookupError === null)) return;
    setUnverifiedId(null);
    setLookupError(null);
    setInvalid(false);
    void lookupRecipient(shortId);
  });

  return (
    <SendLayout title="Send" icon={<MoneyOutIcon />} onBack={navigation.goBack}>
      <GlassCard style={styles.sendTo}>
        <Text style={styles.label}>Send to</Text>
        <OutlinedField invalid={invalid} focused={idFocus.focused} filled={shortId.length > 0}>
          <Text style={styles.idTag}>ID</Text>
          <TextInput
            value={shortId}
            onChangeText={onChangeId}
            placeholder="PRC4Fa"
            placeholderTextColor="rgba(34, 32, 33, 0.2)"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={SHORT_ID_LENGTH}
            accessibilityLabel="Recipient short ID"
            accessibilityHint={lookupError ?? undefined}
            onFocus={idFocus.onFocus}
            onBlur={idFocus.onBlur}
            style={styles.idInput}
          />
          <ContactCardIcon />
        </OutlinedField>
        {lookupError ? (
          <Text style={styles.lookupError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {lookupError}
          </Text>
        ) : checking ? (
          <Text style={styles.checking} accessibilityLiveRegion="polite">
            Checking ID…
          </Text>
        ) : unverifiedId ? (
          <Notice
            tone="warning"
            title="Check this ID before you continue"
            action={
              <Button
                label={`Continue with ${unverifiedId}`}
                variant="outline"
                onPress={() => goToAmount(unverifiedRecipient(unverifiedId))}
              />
            }
          >
            You're offline, so we can't confirm ID {unverifiedId}. Ask the recipient to confirm it. A wrong ID will usually
            make the payment fail.
          </Notice>
        ) : null}
      </GlassCard>

      <View style={styles.methodsSection}>
        <Text style={styles.sectionLabel}>Methods</Text>
        <GlassCard style={styles.methods}>
          <View style={styles.bankRow}>
            <View style={styles.bankIcon}>
              <BankIcon />
            </View>
            <Text style={styles.bankLabel}>Online Banks</Text>
            <AddBoxIcon />
          </View>

          {SEND_METHODS.map((m) => {
            const selected = m.key === method;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => (m.available ? setMethod(m.key) : setUnavailable(m.label))}
                style={[styles.methodRow, selected && styles.methodRowSelected]}
              >
                <View style={[styles.methodDot, { backgroundColor: m.color }]}>
                  <Text style={styles.methodLetter}>{m.letter}</Text>
                </View>
                <Text style={styles.methodLabel}>{m.label}</Text>
                {m.isDefault ? (
                  <View style={styles.defaultPill}>
                    <Text style={styles.defaultText}>DEFAULT</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          <Pressable accessibilityRole="button" accessibilityLabel="Scan QR" onPress={() => navigation.navigate('QrScan', { mode: route.params?.mode })} style={styles.methodRow}>
            <View style={styles.scanIcon}>
              <QrTitleIcon color={colors.textMuted} />
            </View>
            <Text style={[styles.methodLabel, styles.scanLabel]}>Scan QR</Text>
          </Pressable>
        </GlassCard>
      </View>

      <View style={styles.recipients}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const selected = t === tab;
            return (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(t)}
                style={[styles.tab, selected && styles.tabActive]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* The row bleeds to the screen edges; the vertical padding keeps the card shadows from being clipped. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.recipientScroll}
          contentContainerStyle={styles.recipientRow}
        >
          <FilterSlideProvider offset={slide}>
            {recipients.length === 0 ? (
              <SlideRow>
                <Text style={styles.empty}>
                  {tab === 'Recent' ? 'No recent recipients yet.' : 'No favorites yet. Tap a star to add one.'}
                </Text>
              </SlideRow>
            ) : (
              recipients.map((r) => (
                <SlideRow key={r.id}>
                  <RecipientCard
                    recipient={r}
                    favorite={isFavorite(r.id)}
                    onPress={goToAmount}
                    onToggleFavorite={(r) => void toggleFavorite(r)}
                  />
                </SlideRow>
              ))
            )}
          </FilterSlideProvider>
        </ScrollView>
      </View>
      <ComingSoonDialog feature={unavailable} onDismiss={() => setUnavailable(null)} />
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  sendTo: { padding: 16, gap: 10 },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  lookupError: { fontFamily: fonts.regular, fontSize: 11, color: colors.coral },
  checking: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  idTag: { width: 26, fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  idInput: { flex: 1, padding: 0, fontFamily: fonts.regular, fontSize: 16, color: colors.text },

  methodsSection: { gap: 12 },
  sectionLabel: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  methods: { padding: 16, gap: 4 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  bankLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 6, borderRadius: 6 },
  methodRowSelected: { backgroundColor: colors.placeholderTint },
  methodDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  methodLetter: { fontFamily: fonts.bold, fontSize: 10, color: colors.surface },
  methodLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 10, color: colors.text },
  scanIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  scanLabel: { color: colors.textMuted },
  defaultPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 100, backgroundColor: colors.primarySoft },
  defaultText: { fontFamily: fonts.light, fontSize: 6, lineHeight: 6, color: colors.textMuted, textAlign: 'center' },

  recipients: { gap: 20 },
  tabs: { height: 35, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(34, 32, 33, 0.2)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  // The 2 dp orange underline sits on top of the 1 dp grey rule instead of stacking under it.
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary, marginBottom: -1 },
  tabText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  recipientScroll: { marginHorizontal: -30, marginVertical: -20, flexGrow: 0 },
  recipientRow: { paddingHorizontal: 30, paddingVertical: 20, gap: 10 },
  empty: { height: 136, fontFamily: fonts.regular, fontSize: 12, color: 'rgba(34, 32, 33, 0.2)' },
});
