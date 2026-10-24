import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppBackground } from '../components/ui/AppBackground';
import { Button } from '../components/ui/Button';
import { Mascot } from '../components/mascot/Mascot';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Landing (870:3041), 402x874.
const combImage = require('../../assets/landing/comb.png');
const logoImage = require('../../assets/brand/logo-stacked.png');

/** "Users" glyph from the Figma icon sprite (small icons, 870:3052), cropped to the visible icon. */
function UsersIcon() {
  return (
    <Svg width={24} height={20} viewBox="0 134.5 23.7143 20">
      <Path
        d="M15.8091 153.708V151.736C15.8091 150.69 15.3927 149.687 14.6515 148.947C13.9103 148.207 12.905 147.792 11.8567 147.792H5.92814C4.87991 147.792 3.8746 148.207 3.13339 148.947C2.39217 149.687 1.97576 150.69 1.97576 151.736V153.708M15.8091 136.084C16.6566 136.304 17.4072 136.798 17.9431 137.489C18.4789 138.18 18.7696 139.029 18.7696 139.903C18.7696 140.776 18.4789 141.625 17.9431 142.317C17.4072 143.008 16.6566 143.502 15.8091 143.721M21.7377 153.708V151.736C21.737 150.862 21.4455 150.013 20.909 149.322C20.3725 148.632 19.6213 148.138 18.7734 147.92M12.845 139.903C12.845 142.081 11.0755 143.847 8.89264 143.847C6.7098 143.847 4.94026 142.081 4.94026 139.903C4.94026 137.724 6.7098 135.958 8.89264 135.958C11.0755 135.958 12.845 137.724 12.845 139.903Z"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function LandingScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Landing'>) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <AppBackground />

      <View style={[styles.content, { paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom) }]}>
        <View style={styles.hero}>
          <Image source={combImage} style={styles.comb} contentFit="contain" />
          <Mascot mood="wave" />
        </View>

        <View style={styles.welcome}>
          <Image source={logoImage} style={styles.logo} contentFit="contain" accessibilityLabel="HoneBill" />
          <Text style={styles.tagline}>Universal Web3 Liquidity. Powered by Cellsian.</Text>
        </View>

        <View style={styles.actions}>
          <Button label="Create an account" icon={<UsersIcon />} onPress={() => navigation.navigate('InputNumber')} />
          <Button label="Sign In" variant="outline" onPress={() => navigation.navigate('Login')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, gap: 40 },
  hero: { height: 396, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  comb: { position: 'absolute', top: 32, width: 402, height: 332 },
  welcome: { height: 99, alignItems: 'center' },
  logo: { width: 178, height: 140, marginTop: -72 },
  tagline: { marginTop: 8, width: 300, textAlign: 'center', fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  actions: { width: 302, gap: 12 },
});
