import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import LottieView, { type LottieViewProps } from 'lottie-react-native';

import { colors, fonts } from '../../theme';

// Figma "Swipe / Info bar" (739:2586 on Inbox, 879:2878 on Transactions): a 342x120 gradient card with
// a ghosted hexagon, a greeting, and Honi tilted -16.71 degrees poking out of the top right.
const W = 342;
const H = 120;

type HoniPlacement = {
  /** Static picture. Use `lottie` instead for an animated Honi. */
  source?: ImageSource | number;
  lottie?: LottieViewProps['source'];
  /** Frame Figma rotates the picture inside (absolute, relative to the banner). */
  frame: { left: number; top: number; width: number; height: number };
  /** The picture itself, centred in the frame. */
  image: { width: number; height: number };
};

/** Honi placements read from each screen's banner; the Transactions Honi holds the honeycomb badge. */
export const BANNER_HONI = {
  inbox: {
    source: require('../../../assets/mascot/honi-wave.png'),
    frame: { left: 175, top: -21.8, width: 196.384, height: 163.58 },
    image: { width: 169, height: 120.053 },
  },
  transactions: {
    lottie: require('../../../assets/mascot/honi-bill.json'),
    frame: { left: 175, top: -15, width: 193.579, height: 154.247 },
    image: { width: 168.996, height: 110.31 },
  },
} satisfies Record<string, HoniPlacement>;

// Card fill from the asset pack (`Notif and History Card`): the 342x120 gradient with the ghosted
// hexagons, exported @2x.
const BANNER_FILL = require('../../../assets/banners/notif-history-card.png');

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
        <Image source={BANNER_FILL} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {/* Anchored to the right edge (the design's 342 dp card), so a narrower card keeps Honi in the corner. */}
      <View
        pointerEvents="none"
        style={[styles.honiFrame, { right: W - frame.left - frame.width, top: frame.top, width: frame.width, height: frame.height }]}
      >
        {honi.lottie ? (
          <LottieView
            source={honi.lottie}
            autoPlay
            loop
            resizeMode="cover"
            style={{ width: image.width, height: image.height, transform: [{ rotate: '-16.71deg' }] }}
          />
        ) : (
          <Image
            source={honi.source}
            style={{ width: image.width, height: image.height, transform: [{ rotate: '-16.71deg' }] }}
            contentFit="cover"
            accessibilityLabel="Honi, the HoneBill mascot"
          />
        )}
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
  // Greeting at the top, subtext pinned to the bottom edge so the two read as separate lines with room between.
  text: { position: 'absolute', left: 19, top: 16, bottom: 16, width: '61%', justifyContent: 'space-between' },
  title: { fontFamily: fonts.medium, fontSize: 18, color: colors.surface },
  subtitle: { fontFamily: fonts.light, fontSize: 14, color: colors.surface },
  honiFrame: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
