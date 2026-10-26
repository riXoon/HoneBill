import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '../../theme';

// Figma "Swipe / Info bar" (739:2586 on Inbox, 879:2878 on Transactions): a 342x120 gradient card with
// a ghosted hexagon, a greeting, and Honi tilted -16.71 degrees poking out of the top right.
const W = 342;
const H = 120;

type HoniPlacement = {
  source: ImageSource | number;
  /** Frame Figma rotates the picture inside (absolute, relative to the banner). */
  frame: { left: number; top: number; width: number; height: number };
  /** The picture itself, centred in the frame. */
  image: { width: number; height: number };
};

/** Honi placements read from each screen's banner; the Transactions Honi holds the honeycomb badge. */
export const BANNER_HONI = {
  inbox: {
    source: require('../../../assets/mascot/honi-banner-inbox.png'),
    frame: { left: 175, top: -21.8, width: 196.384, height: 163.58 },
    image: { width: 169, height: 120.053 },
  },
  transactions: {
    source: require('../../../assets/mascot/honi-banner-transactions.png'),
    frame: { left: 175, top: -15, width: 193.579, height: 154.247 },
    image: { width: 168.996, height: 110.31 },
  },
} satisfies Record<string, HoniPlacement>;

/**
 * The card fill is the four Figma layers (bottom to top): peach linear, orange radial, 20% yellow wash,
 * red-orange radial. Backdrop blur is not reproduced (it is costly on low-end Android and there is
 * nothing behind the card to blur).
 */
function BannerFill() {
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="peach" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={W} y2={0}>
          <Stop offset={0.27885} stopColor="rgb(253,190,155)" />
          <Stop offset={1} stopColor="rgb(253,190,155)" stopOpacity={0.01} />
        </LinearGradient>
        <RadialGradient
          id="orange"
          gradientUnits="userSpaceOnUse"
          cx={0}
          cy={0}
          r={10}
          gradientTransform="matrix(6.0035 -13.567 41.996 8.2596 64 135.67)"
        >
          <Stop offset={0.32692} stopColor="rgb(255,150,58)" />
          <Stop offset={0.49519} stopColor="rgb(255,176,107)" stopOpacity={0.75} />
          <Stop offset={0.66346} stopColor="rgb(255,202,156)" stopOpacity={0.5} />
          <Stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id="red"
          gradientUnits="userSpaceOnUse"
          cx={0}
          cy={0}
          r={10}
          gradientTransform="matrix(2.15 7.6 -51.97 6.5342 86 4.6667)"
        >
          <Stop offset={0} stopColor="rgb(255,108,29)" />
          <Stop offset={0.16346} stopColor="rgb(255,123,63)" />
          <Stop offset={0.32692} stopColor="rgb(255,138,96)" />
          <Stop offset={0.67096} stopColor="rgb(248,85,85)" stopOpacity={0.07} />
          <Stop offset={0.67101} stopColor="rgb(251,88,42)" stopOpacity={0.285} />
          <Stop offset={0.67106} stopColor="rgb(255,91,0)" stopOpacity={0.5} />
          <Stop offset={1} stopColor="rgb(255,91,0)" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#peach)" />
      <Rect width={W} height={H} fill="url(#orange)" />
      <Rect width={W} height={H} fill="rgb(255,204,0)" fillOpacity={0.2} />
      <Rect width={W} height={H} fill="url(#red)" />
      {/* Ghosted hexagon trio: Figma "Vector" 180x180 at (-45, -17), white 50%. */}
      <Path
        transform="translate(-45 -17)"
        fill={colors.surface}
        fillOpacity={0.5}
        d="M149.299 60.3502L135.951 33.6687C135.396 32.5687 134.548 31.6436 133.499 30.996C132.451 30.3485 131.244 30.0037 130.011 30H96.6407C94.1046 30 91.7686 31.4008 90.7008 33.6687L79.2214 56.6815H49.9889C47.4527 56.6815 45.1168 58.0823 44.0489 60.3502L30.7008 87.0317C29.7664 88.8994 29.7664 91.1006 30.7008 92.9683L44.0489 119.65C44.6036 120.75 45.4521 121.675 46.5006 122.322C47.549 122.97 48.7564 123.315 49.9889 123.319H79.2214L90.7008 146.331C91.2554 147.431 92.104 148.356 93.1524 149.004C94.2009 149.652 95.4082 149.996 96.6407 150H130.011C132.547 150 134.883 148.599 135.951 146.331L149.299 119.65C150.234 117.782 150.234 115.581 149.299 113.713L137.419 90.0334L149.299 66.3535C150.234 64.4858 150.234 62.2846 149.299 60.4169V60.3502ZM100.712 43.3407H125.806L135.818 63.3519L125.806 83.363H100.712L90.7008 63.3519L100.712 43.3407ZM43.9822 90.0334L53.9933 70.0222H79.0879L89.099 90.0334L79.0879 110.044H53.9933L43.9822 90.0334ZM125.806 136.726H100.712L90.7008 116.715L100.712 96.7037H125.806L135.818 116.715L125.806 136.726Z"
      />
    </Svg>
  );
}

type PromoBannerProps = {
  title: string;
  /** Use "\n" for the designed line break. */
  subtitle: string;
  honi: HoniPlacement;
};

export function PromoBanner({ title, subtitle, honi }: PromoBannerProps) {
  const { frame, image } = honi;
  return (
    <View style={styles.card}>
      <View style={styles.clip}>
        <BannerFill />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View pointerEvents="none" style={[styles.honiFrame, frame]}>
        <Image
          source={honi.source}
          style={{ width: image.width, height: image.height, transform: [{ rotate: '-16.71deg' }] }}
          contentFit="cover"
          accessibilityLabel="Honi, the HoneBill mascot"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: W,
    height: H,
    borderRadius: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  clip: { ...StyleSheet.absoluteFill, borderRadius: 12, overflow: 'hidden' },
  text: { position: 'absolute', left: 19, top: 15.5, width: 208, gap: 2 },
  title: { fontFamily: fonts.medium, fontSize: 18, color: colors.surface },
  subtitle: { fontFamily: fonts.light, fontSize: 12, color: colors.surface },
  honiFrame: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
