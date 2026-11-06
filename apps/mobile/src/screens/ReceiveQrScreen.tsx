import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { HoneBillMark } from '../components/brand/HoneBillMark';
import { GlassCard } from '../components/send/GlassCard';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { DownloadIcon, QrTitleIcon } from '../components/ui/smallIcons';
import { useAuth } from '../context/AuthContext';
import { formatPeso } from '../utils/format';
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: Receive2 - My QR (870:2925), 402x874.
const QR_BOX = 222;
const QR_SIZE = 174;

export function ReceiveQrScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ReceiveQr'>) {
  const { amount } = route.params;
  const { activeAccount } = useAuth();
  const shortId = activeAccount?.shortId ?? '';
  const qrBox = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  // A payment request for the user's own short ID and amount, which the Send screen's scanner reads.
  // It carries no signature: a signed, sync-able voucher is a separate, later step.
  const payload = `honebill://relay-voucher?id=${shortId}&amount=${amount.toFixed(2)}`;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Loaded lazily: Expo Go's binary lacks the ExpoMediaLibraryNext native module, and a top-level
      // import would crash the whole app at startup. Fall back to the share sheet there.
      let MediaLibrary: typeof import('expo-media-library') | null = null;
      try {
        MediaLibrary = await import('expo-media-library');
      } catch {
        MediaLibrary = null;
      }

      if (MediaLibrary) {
        const permission = await MediaLibrary.requestPermissionsAsync(true);
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow access to your photos to save the QR code.');
          return;
        }
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved', 'The QR code is in your gallery.');
      } else {
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save QR code' });
      }
    } catch {
      Alert.alert('Could not save', 'Something went wrong while saving the QR code. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SendLayout title="My QR Code" icon={<QrTitleIcon />} onBack={navigation.goBack}>
      <GlassCard style={styles.card}>
        <View style={styles.identity}>
          <HoneBillMark />
          <View style={styles.identityText}>
            <Text style={styles.voucher}>Offline Relay Voucher</Text>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>Awaiting sync</Text>
            </View>
          </View>
        </View>

        <View style={styles.transfer}>
          <Text style={styles.transferLabel}>TRANSFER AMOUNT</Text>
          <Text style={styles.transferAmount}>{formatPeso(amount)}</Text>
          <Text style={styles.transferId}>ID: {shortId}</Text>
        </View>

        {/* Captured as the saved image: the outlined quiet zone and the code. */}
        <View ref={qrBox} collapsable={false} style={styles.qrBox} accessibilityLabel={`QR code for ${formatPeso(amount)}`}>
          <QRCode value={payload} size={QR_SIZE} color={colors.text} backgroundColor={colors.surface} quietZone={0} ecl="M" />
        </View>

        <Button
          label={saving ? 'Saving…' : 'Save QR Code'}
          size="large"
          onPress={() => void save()}
          disabled={saving}
          icon={saving ? undefined : <DownloadIcon color={colors.surface} />}
        />
      </GlassCard>

      <Text style={styles.caption}>Show this QR code to a helper to relay your transfer when they’re online.</Text>
    </SendLayout>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 20, alignItems: 'center' },
  identity: { width: '100%', alignItems: 'center', gap: 10, padding: 10 },
  identityText: { alignItems: 'center', gap: 2 },
  voucher: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: colors.placeholderTint,
  },
  badgeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  badgeText: { fontFamily: fonts.light, fontSize: 12, color: colors.textMuted },
  transfer: { width: '100%', alignItems: 'center', gap: 4 },
  transferLabel: { fontFamily: fonts.light, fontSize: 8, color: colors.textMuted, textAlign: 'center' },
  transferAmount: { fontFamily: fonts.regular, fontSize: 32, color: colors.text, textAlign: 'center' },
  transferId: { fontFamily: fonts.light, fontSize: 17, color: colors.textMuted, textAlign: 'center' },
  qrBox: {
    width: QR_BOX,
    height: QR_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.surface,
  },
  caption: { width: 302, alignSelf: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
