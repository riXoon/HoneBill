import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { GradientTitle } from '../components/ui/GradientTitle';
import { SwipeToEnter } from '../components/ui/SwipeToEnter';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Account Confirmation (870:2950), 402x874.
const combImage = require('../../assets/landing/comb.png');
const wordmarkImage = require('../../assets/brand/logo-wordmark.png');

export function AccountConfirmationScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AccountConfirmation'>) {
  const enter = () => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });

  return (
    <View style={styles.root}>
      <AppBackground />

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle size={32}>Vault Secured</GradientTitle>
          <Text style={styles.subtitle}>Your device is now primed for offline zero data transactions.</Text>
        </View>

        {/* "mascot w bg": honeycomb, Honi, a faded mirrored copy and the wordmark, 400 dp tall. */}
        <View style={styles.mascotArea} pointerEvents="none">
          <Image source={combImage} style={styles.comb} contentFit="contain" />
          <Mascot mood="idlePlain" style={styles.honi} />
          <Mascot mood="idlePlain" animated={false} style={styles.reflection} />
          <Image source={wordmarkImage} style={styles.wordmark} contentFit="contain" accessibilityLabel="HoneBill" />
        </View>

        <View style={styles.swipe}>
          <SwipeToEnter onComplete={enter} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40 },
  titleBlock: { gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  mascotArea: { height: 400, width: '100%', alignItems: 'center' },
  comb: { position: 'absolute', top: -17, width: 402, height: 332 },
  honi: { position: 'absolute', top: 87 },
  reflection: { position: 'absolute', top: 324, opacity: 0.5, transform: [{ scaleY: -1 }] },
  wordmark: { position: 'absolute', top: 322, width: 172, height: 56 },
  swipe: { alignItems: 'center', marginTop: 54 },
});
