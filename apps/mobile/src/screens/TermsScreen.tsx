import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { CheckIcon, ContactCardIcon, LockIcon, ReceiptIcon, SwapIcon } from '../components/ui/smallIcons';
import { TERMS_ACK, TERMS_CLOSING, TERMS_KEY_POINTS, TERMS_SECTIONS, type TermsClause } from '../content/terms';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius } from '../theme';
import { useT } from '../i18n';

const KEY_POINT_ICONS = {
  custody: LockIcon,
  irreversible: SwapIcon,
  sms: ReceiptIcon,
  p2p: ContactCardIcon,
} as const;

const SECTION_COUNT = TERMS_SECTIONS.length;
// Counts every word of the legal text, at an average reading speed of 200 words a minute.
const READ_MINUTES = Math.max(
  1,
  Math.round(
    JSON.stringify(TERMS_SECTIONS).split(/\s+/).length / 200,
  ),
);
/** Pixels from the bottom that still count as "reached the end". */
const END_SLACK = 24;

function Clause({ clause }: { clause: TermsClause }) {
  return (
    <View style={styles.clause}>
      {clause.body || clause.heading ? (
        <Text style={styles.clauseText}>
          {clause.ref ? <Text style={styles.clauseRef}>{clause.ref}  </Text> : null}
          {clause.heading ? <Text style={styles.clauseHeading}>{clause.heading}{clause.body ? ': ' : ''}</Text> : null}
          {clause.body}
        </Text>
      ) : null}
      {clause.items?.map((item) => (
        <View key={item.heading} style={styles.bullet}>
          <View style={styles.bulletDot} />
          <Text style={[styles.clauseText, styles.bulletText]}>
            <Text style={styles.clauseHeading}>{item.heading}: </Text>
            {item.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function TermsScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Terms'>) {
  const t = useT();
  const accepting = route.params?.mode === 'accept';
  const insets = useSafeAreaInsets();

  const [reachedEnd, setReachedEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [currentSection, setCurrentSection] = useState(1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const sectionTops = useRef<number[]>([]);
  const endRef = useRef(false);
  const sectionRef = useRef(1);

  const scrollable = Math.max(0, contentHeight - layoutHeight);

  // The fill slides in from the left on the UI thread (no setState per frame).
  const fillX = useMemo(
    () =>
      scrollable > 0 && trackWidth > 0
        ? scrollY.interpolate({ inputRange: [0, scrollable], outputRange: [-trackWidth, 0], extrapolate: 'clamp' })
        : new Animated.Value(-trackWidth),
    [scrollY, scrollable, trackWidth],
  );

  // JS-side bookkeeping only runs when a value really changes (section index, reached the end), not on every frame.
  const track = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (!endRef.current && contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK) {
        endRef.current = true;
        setReachedEnd(true);
      }
      const probe = contentOffset.y + layoutMeasurement.height * 0.35;
      let index = 1;
      sectionTops.current.forEach((top, i) => {
        if (top !== undefined && top <= probe) index = i + 1;
      });
      if (endRef.current) index = SECTION_COUNT;
      if (index !== sectionRef.current) {
        sectionRef.current = index;
        setCurrentSection(index);
      }
    },
    [],
  );

  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: track }),
    [scrollY, track],
  );

  // A short window (or large screen) may show the whole text with no scrolling: that counts as read.
  const onContentSize = (_w: number, h: number) => {
    setContentHeight(h);
    if (layoutHeight > 0 && h <= layoutHeight + END_SLACK && !endRef.current) {
      endRef.current = true;
      setReachedEnd(true);
    }
  };
  const onScrollLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setLayoutHeight(h);
    if (contentHeight > 0 && contentHeight <= h + END_SLACK && !endRef.current) {
      endRef.current = true;
      setReachedEnd(true);
    }
  };

  const canAgree = reachedEnd && agreed;
  const accept = () => {
    if (!canAgree) return;
    // Back to the screen that asked, with the box ticked.
    navigation.popTo('InputNumber', { termsAccepted: true }, { merge: true });
  };

  const hint = !reachedEnd
    ? t.terms.scrollHint(currentSection, SECTION_COUNT)
    : !agreed
      ? t.terms.tickHint
      : null;

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome onBack={navigation.goBack} />

      <View style={[styles.header, { paddingTop: Math.max(32, insets.top + 8) + 56 }]}>
        <GradientTitle size={28}>Terms & Conditions</GradientTitle>
        <Text style={styles.subtitle}>
          {accepting
            ? t.terms.readAccepting(READ_MINUTES)
            : t.terms.read(READ_MINUTES)}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
            <Animated.View style={[styles.fill, { width: trackWidth, transform: [{ translateX: fillX }] }]} />
          </View>
          <Text style={styles.progressLabel} accessibilityLiveRegion="polite">
            {reachedEnd ? 'Done' : `${currentSection}/${SECTION_COUNT}`}
          </Text>
        </View>
      </View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onScrollLayout}
        onContentSizeChange={onContentSize}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.keyCard}>
          <Text style={styles.keyEyebrow}>THE SHORT VERSION</Text>
          {TERMS_KEY_POINTS.map((point) => {
            const Icon = KEY_POINT_ICONS[point.key];
            return (
              <View key={point.key} style={styles.keyRow}>
                <View style={styles.keyIcon}>
                  <Icon color={colors.coral} size={22} />
                </View>
                <View style={styles.keyCopy}>
                  <Text style={styles.keyTitle}>{point.title}</Text>
                  <Text style={styles.keyBody}>{point.body}</Text>
                  <Text style={styles.keyClause}>Clause {point.clause}</Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.keyNote}>{t.terms.highlights}</Text>
        </View>

        {TERMS_SECTIONS.map((section, i) => (
          <View
            key={section.id}
            style={styles.section}
            onLayout={(e) => {
              sectionTops.current[i] = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionHead}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{section.id}</Text>
              </View>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title}
              </Text>
            </View>
            {section.clauses.map((clause, j) => (
              <Clause key={`${section.id}-${j}`} clause={clause} />
            ))}
          </View>
        ))}

        {accepting ? (
          <>
            <Text style={styles.closing}>{TERMS_CLOSING}</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed, disabled: !reachedEnd }}
              disabled={!reachedEnd}
              onPress={() => setAgreed((a) => !a)}
              style={[styles.ack, !reachedEnd && styles.ackLocked]}
            >
              <View style={[styles.box, agreed && styles.boxChecked]}>{agreed ? <CheckIcon /> : null}</View>
              <Text style={styles.ackText}>{TERMS_ACK}</Text>
            </Pressable>
          </>
        ) : null}
      </Animated.ScrollView>

      {accepting ? (
        <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          {hint ? (
            <Text style={styles.hint} accessibilityLiveRegion="polite">
              {hint}
            </Text>
          ) : null}
          <Button label={t.terms.agree} size="large" onPress={accept} disabled={!canAgree} />
        </View>
      ) : (
        <View style={{ height: Math.max(16, insets.bottom) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 32, paddingBottom: 14, gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.primarySoft },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progressLabel: { minWidth: 34, textAlign: 'right', fontFamily: fonts.medium, fontSize: 13, color: colors.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 6, paddingBottom: 28, gap: 14 },

  keyCard: {
    gap: 14,
    padding: 16,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.yellow,
  },
  keyEyebrow: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 1, color: colors.coral },
  keyRow: { flexDirection: 'row', gap: 12 },
  keyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  keyCopy: { flex: 1, gap: 2 },
  keyTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  keyBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  keyClause: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  keyNote: { fontFamily: fonts.light, fontSize: 13, lineHeight: 19, color: colors.textMuted },

  section: { gap: 12, padding: 16, borderRadius: radius.field, backgroundColor: colors.card },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  badgeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.surface },
  sectionTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: colors.text },
  clause: { gap: 8 },
  clauseText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.text },
  clauseRef: { fontFamily: fonts.semibold, color: colors.primary },
  clauseHeading: { fontFamily: fonts.semibold },
  bullet: { flexDirection: 'row', gap: 8, paddingLeft: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7, backgroundColor: colors.primary },
  bulletText: { flex: 1 },

  closing: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, color: colors.text, paddingHorizontal: 4 },
  ack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  ackLocked: { opacity: 0.5 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  ackText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, color: colors.text },

  footer: { paddingHorizontal: 32, paddingTop: 12, gap: 10, backgroundColor: colors.background },
  hint: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
