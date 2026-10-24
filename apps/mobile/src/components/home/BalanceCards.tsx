import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { splitPesos } from '../../mocks/home';
import { colors, fonts } from '../../theme';

// Figma: Cards (483:637). Two 342 dp cards sit one behind the other. Switching shuffles them: the
// front card slides up, passes over the top and slides down behind the other card, which moves
// forward. (Figma mirrors the back card; it is left unmirrored here so nothing appears to flip.)
export type BalanceMode = 'online' | 'offline';

const CARD_W = 342;
const CARD_H = 179.67;
const BACK_OFFSET = { x: 17, y: 18 };
const SLIDE_MS = 600;
/** How far the leaving card rises before it drops behind. */
const LIFT = 70;

// Card fills are images exported from the Figma card components (511:820 online, 511:822 offline),
// with the text, icons and chip painted out. They keep Figma's translucency, so the card in front
// shows the other card through its right side, exactly as in the design. The 5 dp backdrop blur is
// the only effect not reproduced.
const FILL = {
  online: require('../../../assets/home/card-online.png'),
  offline: require('../../../assets/home/card-offline.png'),
} as const;

/** Sprite icons are centred on (11.86, 144.83) in the Figma icon sheet. */
const SPRITE_BOX = '-0.14 132.83 24 24';

function WifiIcon() {
  return (
    <Svg width={24} height={24} viewBox={SPRITE_BOX}>
      <Path
        d="M11.8569 152.722H11.8669M1.97592 141.697C4.69329 139.272 8.21113 137.931 11.8569 137.931C15.5026 137.931 19.0204 139.272 21.7378 141.697M4.9402 145.68C6.78724 143.873 9.2705 142.861 11.8569 142.861C14.4432 142.861 16.9265 143.873 18.7735 145.68M8.39867 149.201C9.32219 148.297 10.5638 147.791 11.857 147.791C13.1502 147.791 14.3918 148.297 15.3153 149.201"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function WifiOffIcon() {
  return (
    <Svg width={24} height={24} viewBox={SPRITE_BOX}>
      <Path
        d="M11.8567 152.722H11.8667M8.3984 149.201C9.32192 148.298 10.5635 147.792 11.8567 147.792C13.1499 147.792 14.3915 148.298 15.3151 149.201M4.94006 145.681C6.3411 144.31 8.11927 143.387 10.048 143.028M10.048 143.028C10.0482 143.028 10.0484 143.028 10.0485 143.028M10.048 143.028L1.97605 134.972M10.048 143.028L21.738 154.695M18.7735 145.681C18.1786 145.098 17.5123 144.594 16.7904 144.179M1.97592 141.698C3.19779 140.607 4.59248 139.726 6.10319 139.091M21.7378 141.698C20.2307 140.352 18.4637 139.329 16.5456 138.691C14.6274 138.053 12.5987 137.813 10.5842 137.986"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function EyeIcon() {
  return (
    <Svg width={24} height={24} viewBox={SPRITE_BOX}>
      <Path
        d="M1.91921 145.181C1.83587 144.957 1.83587 144.71 1.91921 144.485C2.73091 142.517 4.10872 140.835 5.87798 139.65C7.64723 138.466 9.72825 137.834 11.8572 137.834C13.9862 137.834 16.0672 138.466 17.8364 139.65C19.6057 140.835 20.9835 142.517 21.7952 144.485C21.8785 144.71 21.8785 144.957 21.7952 145.181C20.9835 147.15 19.6057 148.832 17.8364 150.017C16.0672 151.201 13.9862 151.833 11.8572 151.833C9.72825 151.833 7.64723 151.201 5.87798 150.017C4.10872 148.832 2.73091 147.15 1.91921 145.181ZM14.8572 144.833C14.8572 146.49 13.5141 147.833 11.8572 147.833C10.2004 147.833 8.85721 146.49 8.85721 144.833C8.85721 143.177 10.2004 141.833 11.8572 141.833C13.5141 141.833 14.8572 143.177 14.8572 144.833Z"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Hexagon badge shown on the offline card (Figma `offline`, 50x50). */
function OfflineBadge() {
  return (
    <Svg width={50} height={50} viewBox="0 0 50 50">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={colors.surface}
        d="M24.2095 12.3882C24.7192 12.0928 25.3473 12.0928 25.857 12.3882L35.5762 18.0197C36.0858 18.315 36.4 18.8608 36.4 19.4517V30.7148C36.4 31.3055 36.0858 31.8513 35.5762 32.1468L25.857 37.7785C25.3473 38.0738 24.7192 38.0738 24.2095 37.7785L14.4904 32.1468C13.9807 31.8513 13.6667 31.3055 13.6667 30.7148V19.4517C13.6667 18.861 13.9807 18.315 14.4904 18.0197L24.2095 12.3882ZM25.0097 17.8412C24.3478 21.5473 21.7789 24.4667 18.5174 25.2187C21.7788 25.9708 24.3478 28.8902 25.0097 32.5963C25.6715 28.8902 28.2405 25.9708 31.5019 25.2187C28.2405 24.4667 25.6715 21.5473 25.0097 17.8412Z"
      />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={colors.surface}
        d="M23.7439 6.35269C24.5542 5.88244 25.5524 5.88244 26.3628 6.35269L40.4639 14.5364C41.2742 15.0067 41.7733 15.8757 41.7733 16.8162V33.1837C41.7733 34.1242 41.2742 34.9933 40.4639 35.4635L26.3628 43.6473C25.5524 44.1175 24.5542 44.1175 23.7439 43.6473L9.64273 35.4635C8.83248 34.9933 8.33335 34.1242 8.33333 33.1837V16.8162C8.33335 15.8757 8.83248 15.0067 9.64273 14.5364L23.7439 6.35269ZM26.1843 8.61765C25.5299 8.23847 24.7235 8.23847 24.0691 8.61765L11.5909 15.848C10.9365 16.2272 10.5333 16.928 10.5333 17.6865V32.1468C10.5333 32.9052 10.9365 33.6062 11.5909 33.9853L24.0691 41.2157C24.7235 41.5948 25.5299 41.5948 26.1843 41.2157L38.6624 33.9853C39.3168 33.6062 39.72 32.9052 39.72 32.1468V17.6865C39.72 16.928 39.3168 16.2272 38.6624 15.848L26.1843 8.61765Z"
      />
    </Svg>
  );
}

type BalanceCardProps = { mode: BalanceMode; amount: number };

/** One card face: fill image, header (icon, label, status chip) and amount row. */
function BalanceCard({ mode, amount }: BalanceCardProps) {
  const online = mode === 'online';
  const { whole, cents } = splitPesos(amount);
  const amountText = `₱${whole}.`;
  return (
    <View style={styles.card}>
      <Image source={FILL[mode]} style={StyleSheet.absoluteFill} contentFit="fill" />

      <View style={styles.header}>
        <View style={styles.label}>
          {online ? <WifiIcon /> : <WifiOffIcon />}
          <Text style={styles.labelText}>{online ? 'Online Balance' : 'Offline Balance'}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{online ? 'Synced' : 'Syncing'}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <EyeIcon />
        <View style={styles.amountWrap}>
          {/* Figma stacks two shadows (soft grey + hard orange); RN allows one per Text, so two copies. */}
          <Text style={[styles.amount, styles.amountSoft]} numberOfLines={1} adjustsFontSizeToFit>
            {amountText}
            <Text style={styles.cents}>{cents}</Text>
          </Text>
          <Text style={[styles.amount, styles.amountHard, StyleSheet.absoluteFill]} numberOfLines={1} adjustsFontSizeToFit>
            {amountText}
            <Text style={styles.cents}>{cents}</Text>
          </Text>
        </View>
        {online ? null : <OfflineBadge />}
      </View>
    </View>
  );
}

type BalanceCardsProps = {
  mode: BalanceMode;
  onlineBalance: number;
  offlineBalance: number;
  /** Tapping the stack asks the screen to switch modes. */
  onToggle: () => void;
};

/** Stacked online/offline cards. Only transform is animated; z-order swaps while the leaving card is at its peak. */
export function BalanceCards({ mode, onlineBalance, offlineBalance, onToggle }: BalanceCardsProps) {
  // t runs 0 -> 1 on every switch. frontIsOnline says which card is arriving at the front.
  const t = useSharedValue(1);
  const frontIsOnline = useSharedValue(mode === 'online' ? 1 : 0);

  useLayoutEffect(() => {
    const nextFront = mode === 'online' ? 1 : 0;
    if (frontIsOnline.value === nextFront) return;
    frontIsOnline.value = nextFront;
    t.value = 0;
    t.value = withTiming(1, {
      duration: SLIDE_MS,
      easing: Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [mode, t, frontIsOnline]);

  // The arriving card glides from the back slot to the front slot; the leaving card rises, then
  // settles into the back slot. Both cards' own slots are (0,0) front and BACK_OFFSET back.
  const cardStyle = (isOnlineCard: boolean) =>
    useAnimatedStyle(() => {
      const arriving = (frontIsOnline.value === 1) === isOnlineCard;
      const p = t.value;
      if (arriving) {
        return {
          zIndex: p < 0.5 ? 1 : 2,
          transform: [{ translateX: BACK_OFFSET.x * (1 - p) }, { translateY: BACK_OFFSET.y * (1 - p) }],
        };
      }
      return {
        zIndex: p < 0.5 ? 2 : 1,
        transform: [
          { translateX: BACK_OFFSET.x * p },
          { translateY: interpolate(p, [0, 0.5, 1], [0, -LIFT, BACK_OFFSET.y]) },
        ],
      };
    });
  const onlineStyle = cardStyle(true);
  const offlineStyle = cardStyle(false);

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`Showing ${mode} balance. Tap to switch to ${mode === 'online' ? 'offline' : 'online'} balance`}
      style={styles.stack}
    >
      <Animated.View style={[styles.face, onlineStyle]}>
        <BalanceCard mode="online" amount={onlineBalance} />
      </Animated.View>
      <Animated.View style={[styles.face, offlineStyle]}>
        <BalanceCard mode="offline" amount={offlineBalance} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { width: 359, height: 199.67 },
  face: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
  },
  card: { width: CARD_W, height: CARD_H, borderRadius: 20, overflow: 'hidden', padding: 20, gap: 76 },
  header: { height: 23.667, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.surface,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 10,
  },
  chip: { backgroundColor: colors.text, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: fonts.regular, fontSize: 8, color: colors.surface },
  amountRow: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountWrap: { flex: 1, justifyContent: 'center' },
  amount: { fontFamily: fonts.regular, fontSize: 32, color: colors.surface },
  cents: { fontSize: 20 },
  amountSoft: { textShadowColor: '#C3C7DA', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 },
  amountHard: { textShadowColor: colors.primary, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
});
