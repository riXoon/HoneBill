import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { AuthScroll } from '../components/ui/AuthScroll';
import { Button } from '../components/ui/Button';
import { fieldStateStyle, useFieldFocus } from '../components/ui/fieldState';
import { GradientTitle } from '../components/ui/GradientTitle';
import { CheckIcon } from '../components/ui/smallIcons';
import type { RootStackParamList } from '../navigation/types';
import { setAccountPhone } from '../services/accountPhone';
import { getDevicePublicKey } from '../services/wallet/deviceWallet';
import { errorMessage, isAborted } from '../services/api/client';
import { sendOtp } from '../services/api/otp';
import { checkUser } from '../services/api/users';
import { colors, fonts, radius } from '../theme';
import { useScale } from '../theme/responsive';
import { messages, useT } from '../i18n';

// Figma: Input Number (870:3025), 402x874.
const COUNTRY_CODE = '+63';
const PHONE_LENGTH = 10;

export function InputNumberScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'InputNumber'>) {
  const t = useT();
  const scale = useScale();
  // `signin` reuses this screen to find an existing account: no OTP on a phone that already holds its wallet, OTP + recovery phrase otherwise.
  const signin = route.params?.mode === 'signin';
  // Sign-up only: the Terms screen sends the user back here with `termsAccepted` once they have read to the end and agreed.
  const termsAccepted = route.params?.termsAccepted === true;
  const [phone, setPhone] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const phoneFocus = useFieldFocus();

  useEffect(() => () => request.current?.abort(), []);

  const submit = async () => {
    if (busy) return;
    if (!signin && !termsAccepted) {
      navigation.navigate('Terms', { mode: 'accept' });
      return;
    }
    if (phone.length !== PHONE_LENGTH) {
      setInvalid(true);
      return;
    }

    const fullPhone = `${COUNTRY_CODE}${phone}`;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      // Checking first saves an SMS and tells the user now, not at the end of sign-up, that the number is taken.
      const account = await checkUser(fullPhone, controller.signal);
      if (signin) {
        if (!account.exists) {
          setError(messages().login.noAccount);
          return;
        }
        // Only a phone that already holds this account's wallet may skip straight to the MPIN. Any other phone
        // (a new device, or a different account) proves the number by OTP, then restores the wallet from its phrase.
        if ((await getDevicePublicKey()) === account.stellarPublicKey) {
          await setAccountPhone(fullPhone);
          navigation.popTo('Login');
          return;
        }
        await sendOtp(fullPhone, controller.signal);
        navigation.navigate('Otp', { phone: fullPhone, purpose: 'recover' });
        return;
      }
      if (account.exists) {
        setError(messages().onboarding.hasAccount);
        return;
      }
      await sendOtp(fullPhone, controller.signal);
      navigation.navigate('Otp', { phone: fullPhone });
    } catch (e) {
      if (!isAborted(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />

      <AuthScroll style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle size={30}>{t.onboarding.phoneTitle}</GradientTitle>
          <Text style={styles.subtitle}>
            {signin
              ? t.onboarding.phoneSignin
              : t.onboarding.phoneSignup}
          </Text>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.row}>
            <View style={[styles.box, styles.code]}>
              <Text style={styles.codeText}>{COUNTRY_CODE}</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/\D/g, '').slice(0, PHONE_LENGTH));
                setInvalid(false);
                setError(null);
              }}
              placeholder="9123456789"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel={t.onboarding.mobileNumber}
              editable={!busy}
              onFocus={phoneFocus.onFocus}
              onBlur={phoneFocus.onBlur}
              style={[styles.box, styles.field, fieldStateStyle(phoneFocus.focused, phone.length > 0), (invalid || error) && styles.invalid]}
            />
          </View>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {signin ? null : (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel={t.onboarding.termsA11y}
              onPress={() =>
                termsAccepted
                  ? navigation.setParams({ termsAccepted: false })
                  : navigation.navigate('Terms', { mode: 'accept' })
              }
              style={styles.consent}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted ? <CheckIcon /> : null}
              </View>
              <Text style={styles.consentText}>
                {termsAccepted ? t.onboarding.agreed : t.onboarding.readAgree}
                <Text
                  style={styles.consentLink}
                  onPress={() => navigation.navigate('Terms', { mode: termsAccepted ? undefined : 'accept' })}
                >
                  Terms & Conditions
                </Text>
              </Text>
            </Pressable>
          )}
          <Button
            label={busy ? t.common.pleaseWait : signin ? t.common.continue : termsAccepted ? 'Send OTP' : t.onboarding.readTerms}
            size="large"
            onPress={() => void submit()}
            disabled={busy}
          />
        </View>

        <View style={[styles.mascotSlot, { height: 292 * scale }]}>
          <Mascot mood="phone" />
        </View>
      </AuthScroll>
      {/* After the scroll area, so the back button is drawn (and tapped) on top of it. */}
      <AuthChrome step={signin ? undefined : 1} onBack={navigation.goBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 40, gap: 40 },
  titleBlock: { gap: 8 },
  subtitle: { width: '100%', maxWidth: 300, fontFamily: fonts.light, fontSize: 15, color: colors.textMuted },
  formBlock: { gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  box: {
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTranslucent,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  code: { width: 72, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontFamily: fonts.regular, fontSize: 16, color: colors.primary },
  field: { flex: 1, paddingHorizontal: 16, color: colors.text },
  invalid: { borderColor: colors.coral },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.coral },
  actions: { gap: 14 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primary },
  consentText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  consentLink: { fontFamily: fonts.semibold, color: colors.primary, textDecorationLine: 'underline' },
  mascotSlot: { alignItems: 'center', justifyContent: 'center' },
});
