import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { captureRef } from 'react-native-view-shot';

import { QrCard } from '../components/send/QrCard';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { DownloadIcon, GenerateQrIcon, QrTitleIcon } from '../components/ui/smallIcons';
import { fullName, useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { colors, fonts } from '../theme';

export function ReceiveQrScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ReceiveQr'>) {
  const amount = route.params?.amount;
  const hasAmount = amount !== undefined && amount > 0;
  const { activeAccount } = useAuth();
  const shortId = activeAccount?.shortId ?? '';
  const qrBox = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  // A payment request for the user's own short ID, with an amount when one was chosen, which the Send scanner reads.
  // It is not an Offline Relay Voucher (that is a separate, signed SMS payload made when sending offline).
  const payload = hasAmount ? `honebill://pay?id=${shortId}&amount=${amount!.toFixed(2)}` : `honebill://pay?id=${shortId}`;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Loaded lazily: Expo Go's binary lacks the ExpoMediaLibraryNext native module, and a top-level
      // import would crash the whole app at startup. Fall back to the share sheet there.
      // Probe for the native module first: importing the JS wrapper without it throws (and is logged as an error
      // even when caught), so only import it in a build that actually contains it.
      let MediaLibrary: typeof import('expo-media-library') | null = null;
      if (requireOptionalNativeModule('ExpoMediaLibraryNext')) {
        try {
          MediaLibrary = await import('expo-media-library');
        } catch {
          MediaLibrary = null;
        }
      }

      if (MediaLibrary) {
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow access to your photos to save the QR card.');
          return;
        }
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        // SDK 57: the old top-level saveToLibraryAsync now always throws; Asset.create is its replacement.
        await MediaLibrary.Asset.create(uri);
        Alert.alert('Saved', 'The QR card is in your gallery.');
      } else {
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save QR card' });
      }
    } catch (e) {
      reportError(e, { step: 'saveQrCard' });
      Alert.alert('Could not save', 'Something went wrong while saving the QR card. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SendLayout title="My QR Code" icon={<QrTitleIcon />} onBack={navigation.goBack}>
      <View style={styles.stack}>
        {/* Captured as the saved image: the whole card. */}
        <QrCard cardRef={qrBox} value={payload} name={fullName(activeAccount)} amount={amount} />

        <Button
          label={saving ? 'Saving…' : 'Save QR Card'}
          size="large"
          onPress={() => void save()}
          disabled={saving}
          icon={saving ? undefined : <DownloadIcon color={colors.surface} />}
        />

        {/* A request for a set amount is a second step: the Short ID QR above is what Receive opens with. */}
        {!hasAmount ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generate QR with amount"
            onPress={() => navigation.navigate('ReceiveAmount')}
            style={({ pressed }) => [styles.withAmount, pressed && styles.pressed]}
          >
            <GenerateQrIcon />
            <Text style={styles.withAmountText}>Generate QR with amount</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.caption}>The sender scans this with the HoneBill scanner and your Short ID is filled in for them.</Text>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center', gap: 20 },
  pressed: { opacity: 0.85 },
  withAmount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  withAmountText: { fontFamily: fonts.regular, fontSize: 17, color: colors.primary, textAlign: 'center' },
  caption: { width: '100%', maxWidth: 302, alignSelf: 'center', fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
