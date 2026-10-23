import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: OTP (870:2988), 402x874.
const OTP_LENGTH = 4;

export function OtpScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Otp'>) {
  const [code, setCode] = useState('');

  // Mock-only: any complete code is accepted until the verification service is wired in.
  const verify = () => {
    if (code.length === OTP_LENGTH) navigation.navigate('UserDetails');
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={2} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.header}>
          <GradientTitle>Verify OTP</GradientTitle>
          <Text style={styles.subtitle}>
            We sent a verification code to your mobile number: {route.params.phone}
          </Text>
        </View>

        <CodeBoxes length={OTP_LENGTH} value={code} onChange={setCode} autoFocus accessibilityLabel="One-time code" />

        <View style={styles.mascotSlot}>
          <Mascot mood="success" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.resend} accessibilityRole="button">
            {"Didn't get an OTP? Resend"}
          </Text>
          <Button label="Verify" size="large" onPress={verify} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40, gap: 40 },
  header: { gap: 11 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  mascotSlot: { height: 196, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: 16, alignItems: 'center' },
  resend: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
