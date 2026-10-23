import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppBackground } from '../components/ui/AppBackground';
import { Keypad } from '../components/ui/Keypad';
import { PinDots } from '../components/ui/PinDots';
import { Mascot } from '../components/mascot/Mascot';
import { MPIN_LENGTH, mockUser } from '../mocks/user';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius } from '../theme';

// Figma: Login Page (870:3055), 402x874.
const logoHorizontal = require('../../assets/brand/logo-horizontal.png');

/** Swap arrows from the Figma icon sprite (870:3065), cropped to the visible glyph. */
function SwapIcon() {
  return (
    <Svg width={17} height={16} viewBox="3.5 136.8 16.7 16">
      <Path
        d="M19.7814 143.216C19.8571 143.034 19.8769 142.833 19.8383 142.639C19.7997 142.445 19.7043 142.266 19.5644 142.126L14.5644 137.126L13.1504 138.54L16.4434 141.833H3.85742V143.833H18.8574C19.0552 143.834 19.2485 143.775 19.413 143.665C19.5775 143.555 19.7057 143.399 19.7814 143.216ZM3.93342 146.45C3.85771 146.633 3.83792 146.834 3.87655 147.028C3.91517 147.222 4.01048 147.401 4.15042 147.54L9.15042 152.54L10.5644 151.126L7.27142 147.833H19.8574V145.833H4.85742C4.65965 145.833 4.46631 145.892 4.30184 146.002C4.13737 146.112 4.00916 146.268 3.93342 146.45Z"
        fill={colors.pink}
      />
    </Svg>
  );
}

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');

  const onDigit = useCallback(
    (digit: string) => {
      // MPIN is not verified yet (mock-only frontend): any complete PIN signs in.
      const next = pin.length < MPIN_LENGTH ? pin + digit : pin;
      setPin(next);
      if (next.length === MPIN_LENGTH) navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    },
    [navigation, pin],
  );
  const onDelete = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  return (
    <View style={styles.root}>
      <AppBackground />

      <View style={[styles.main, { paddingTop: Math.max(24, insets.top) + 60 }]}>
        <Image source={logoHorizontal} style={styles.logo} contentFit="contain" accessibilityLabel="HoneBill" />

        {/* The mascot image is larger than its 260x200 slot (soft glow bleed); it overflows evenly. */}
        <View style={styles.mascotArea}>
          <Mascot mood="idle" style={styles.mascot} />
        </View>

        <View style={styles.inputSection}>
          <View style={styles.phonePill}>
            <Text style={styles.phone}>{mockUser.phone}</Text>
            <View style={styles.swap}>
              <SwapIcon />
            </View>
          </View>
          <Text style={styles.prompt}>Enter your MPIN</Text>
          <PinDots length={MPIN_LENGTH} filled={pin.length} />
        </View>
      </View>

      <View style={[styles.keypad, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Keypad onDigit={onDigit} onDelete={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  main: { flex: 1, alignItems: 'center' },
  logo: { width: 133, height: 30, marginBottom: 17 },
  mascotArea: { width: 260, height: 200, alignItems: 'center' },
  mascot: { marginTop: -20 },
  inputSection: { width: '100%', alignItems: 'center', paddingTop: 20, gap: 16 },
  phonePill: {
    width: 302,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderRed,
    backgroundColor: 'rgba(247, 247, 251, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: { fontFamily: fonts.regular, fontSize: 18, color: colors.coral, textAlign: 'center' },
  swap: { position: 'absolute', right: 26, top: 0, bottom: 0, justifyContent: 'center' },
  prompt: { width: 200, textAlign: 'center', fontFamily: fonts.light, fontSize: 14, color: colors.primary },
  keypad: { width: '100%' },
});
