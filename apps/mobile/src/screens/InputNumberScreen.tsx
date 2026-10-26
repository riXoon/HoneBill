import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius } from '../theme';

// Figma: Input Number (870:3025), 402x874.
const COUNTRY_CODE = '+63';
const PHONE_LENGTH = 10;

export function InputNumberScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'InputNumber'>) {
  const [phone, setPhone] = useState('');
  const [invalid, setInvalid] = useState(false);

  const sendOtp = () => {
    if (phone.length !== PHONE_LENGTH) {
      setInvalid(true);
      return;
    }
    // No SMS is sent yet (mock-only frontend); the OTP screen accepts any 4 digits.
    navigation.navigate('Otp', { phone: `${COUNTRY_CODE}${phone}` });
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={1} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle size={30}>Enter your phone number</GradientTitle>
          <Text style={styles.subtitle}>Link your mobile number to set up your online and offline accounts</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.box, styles.code]}>
            <Text style={styles.codeText}>{COUNTRY_CODE}</Text>
          </View>
          <TextInput
            value={phone}
            onChangeText={(t) => {
              setPhone(t.replace(/\D/g, '').slice(0, PHONE_LENGTH));
              setInvalid(false);
            }}
            placeholder="9123456789"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            accessibilityLabel="Mobile number"
            style={[styles.box, styles.field, invalid && styles.invalid]}
          />
        </View>

        <Button label="Send OTP" size="large" onPress={sendOtp} />

        <View style={styles.mascotSlot}>
          <Mascot mood="phone" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40, gap: 40 },
  titleBlock: { gap: 8 },
  subtitle: { width: 300, fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 8 },
  box: {
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTranslucent,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  code: { width: 72, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontFamily: fonts.regular, fontSize: 14, color: colors.primary },
  field: { flex: 1, paddingHorizontal: 16, color: colors.text },
  invalid: { borderColor: colors.coral },
  mascotSlot: { height: 292, alignItems: 'center', justifyContent: 'center' },
});
