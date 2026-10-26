import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { GlassCard } from '../components/send/GlassCard';
import { OutlinedField } from '../components/send/OutlinedField';
import { RecipientCard } from '../components/send/RecipientCard';
import { SendLayout } from '../components/send/SendLayout';
import { FilterSlideProvider, SlideRow, useFilterSlide } from '../components/ui/FilterSlide';
import { AddBoxIcon, BankIcon, ContactCardIcon, MoneyOutIcon, QrTitleIcon } from '../components/ui/smallIcons';
import {
  SEND_METHODS,
  SHORT_ID_LENGTH,
  findRecipientByShortId,
  mockRecents,
  type Recipient,
  type SendMethodKey,
} from '../mocks/send';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Send 1 - To (870:3195), 402x874.
const TABS = ['Recent', 'Favorites'] as const;
type Tab = (typeof TABS)[number];

export function SendToScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'SendTo'>) {
  const [shortId, setShortId] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [method, setMethod] = useState<SendMethodKey>('gcash');
  const [tab, setTab] = useState<Tab>('Recent');
  const [favorites, setFavorites] = useState(() => new Set(mockRecents.filter((r) => r.favorite).map((r) => r.id)));
  const slide = useFilterSlide(TABS.indexOf(tab));

  const recipients = tab === 'Recent' ? mockRecents : mockRecents.filter((r) => favorites.has(r.id));

  const goToAmount = (recipient: Recipient) => {
    Keyboard.dismiss();
    navigation.navigate('SendAmount', { recipientId: recipient.id });
  };

  const onChangeId = (text: string) => {
    const next = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, SHORT_ID_LENGTH);
    setShortId(next);
    setInvalid(false);
    // The short ID has a fixed length, so resolve it as soon as it is complete.
    if (next.length === SHORT_ID_LENGTH) {
      const found = findRecipientByShortId(next);
      if (found) goToAmount(found);
      else setInvalid(true);
    }
  };

  const toggleFavorite = (recipient: Recipient) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      if (!next.delete(recipient.id)) next.add(recipient.id);
      return next;
    });

  return (
    <SendLayout title="Send" icon={<MoneyOutIcon />} onBack={navigation.goBack}>
      <GlassCard style={styles.sendTo}>
        <Text style={styles.label}>Send to</Text>
        <OutlinedField invalid={invalid}>
          <Text style={styles.idTag}>ID</Text>
          <TextInput
            value={shortId}
            onChangeText={onChangeId}
            placeholder="PRC4F"
            placeholderTextColor="rgba(34, 32, 33, 0.2)"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={SHORT_ID_LENGTH}
            accessibilityLabel="Recipient short ID"
            accessibilityHint={invalid ? 'No account found for this ID' : undefined}
            style={styles.idInput}
          />
          <ContactCardIcon />
        </OutlinedField>
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
                onPress={() => setMethod(m.key)}
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

          <Pressable accessibilityRole="button" accessibilityLabel="Scan QR" onPress={() => navigation.navigate('QrScan')} style={styles.methodRow}>
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
                <Text style={styles.empty}>No favorites yet. Tap a star to add one.</Text>
              </SlideRow>
            ) : (
              recipients.map((r) => (
                <SlideRow key={r.id}>
                  <RecipientCard
                    recipient={r}
                    favorite={favorites.has(r.id)}
                    onPress={goToAmount}
                    onToggleFavorite={toggleFavorite}
                  />
                </SlideRow>
              ))
            )}
          </FilterSlideProvider>
        </ScrollView>
      </View>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  sendTo: { padding: 16, gap: 10 },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
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
