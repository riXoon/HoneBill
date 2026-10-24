import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { GradientTitle } from '../components/ui/GradientTitle';
import { MPIN_LENGTH } from '../mocks/user';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: MPIN Creation (870:2965), 402x874.

/** Padlock from the Figma icon sprite (small icons, 870:2983); sprite icons are centred on (11.86, 144.83). */
function LockIcon() {
  return (
    <Svg width={24} height={24} viewBox="-0.14 132.83 24 24">
      <Path
        d="M6.91709 143.847V139.903C6.91709 138.595 7.43761 137.341 8.36413 136.416C9.29064 135.492 10.5473 134.972 11.8576 134.972C13.1679 134.972 14.4245 135.492 15.351 136.416C16.2775 137.341 16.798 138.595 16.798 139.903V143.847M4.9409 143.847H18.7742C19.8657 143.847 20.7504 144.73 20.7504 145.819V152.722C20.7504 153.811 19.8657 154.694 18.7742 154.694H4.9409C3.84948 154.694 2.96471 153.811 2.96471 152.722V145.819C2.96471 144.73 3.84948 143.847 4.9409 143.847Z"
        stroke={colors.surface}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function MpinCreationScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'MpinCreation'>) {
  const [pin, setPin] = useState('');

  // The PIN is not stored yet (mock-only frontend).
  const confirm = () => {
    if (pin.length === MPIN_LENGTH) navigation.navigate('AccountConfirmation');
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={4} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle>Secure Your Account</GradientTitle>
          <Text style={styles.subtitle}>Create a 4-digit PIN to protect your device</Text>
        </View>

        <CodeBoxes length={MPIN_LENGTH} value={pin} onChange={setPin} secure autoFocus accessibilityLabel="New 4-digit PIN" />

        <Button label="Confirm 4-digit pin" size="large" icon={<LockIcon />} onPress={confirm} />

        {/* Honi's image (shield and lock included) is taller than the 196 dp component; it hangs from the top. */}
        <View style={styles.mascotSlot}>
          <Mascot mood="secure" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40, gap: 40 },
  titleBlock: { gap: 8 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  mascotSlot: { height: 300, alignItems: 'center' },
});
