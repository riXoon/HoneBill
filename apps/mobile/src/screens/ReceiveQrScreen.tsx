import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { captureRef } from 'react-native-view-shot';

import { QrCard } from '../components/send/QrCard';
import { SendLayout } from '../components/send/SendLayout';
import { Button } from '../components/ui/Button';
import { ResultDialog, type ResultDialogProps } from '../components/ui/ResultDialog';
import { DownloadIcon, GenerateQrIcon, QrTitleIcon } from '../components/ui/smallIcons';
import { fullName, useAuth } from '../context/AuthContext';
import { messages, useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { reportError } from '../services/errorReporting';
import { errorHaptic, successHaptic } from '../services/haptics';
import { colors, fonts } from '../theme';

export function ReceiveQrScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ReceiveQr'>) {
  const amount = route.params?.amount;
  const hasAmount = amount !== undefined && amount > 0;
  const { activeAccount } = useAuth();
  const shortId = activeAccount?.shortId ?? '';
  const qrBox = useRef<View>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();
  const [outcome, setOutcome] = useState<Pick<ResultDialogProps, 'mood' | 'title' | 'message'> | null>(null);

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
          errorHaptic();
          setOutcome({ mood: 'fail', title: messages().receiveQr.permissionTitle, message: messages().receiveQr.permissionBody });
          return;
        }
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        // SDK 57: the old top-level saveToLibraryAsync now always throws; Asset.create is its replacement.
        await MediaLibrary.Asset.create(uri);
        successHaptic();
        setOutcome({ mood: 'success', title: messages().receiveQr.savedTitle, message: messages().receiveQr.savedBody });
      } else {
        const uri = await captureRef(qrBox, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: messages().receiveQr.shareTitle });
      }
    } catch (e) {
      reportError(e, { step: 'saveQrCard' });
      errorHaptic();
      setOutcome({ mood: 'fail', title: messages().receiveQr.failTitle, message: messages().receiveQr.failBody });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SendLayout title={t.receiveQr.title} icon={<QrTitleIcon />} onBack={navigation.goBack}>
      <View style={styles.stack}>
        {/* Captured as the saved image: the whole card. */}
        <QrCard cardRef={qrBox} value={payload} name={fullName(activeAccount)} amount={amount} />

        <Button
          label={saving ? t.receiveQr.saving : t.receiveQr.save}
          size="large"
          onPress={() => void save()}
          disabled={saving}
          icon={saving ? undefined : <DownloadIcon color={colors.surface} />}
        />

        {/* A request for a set amount is a second step: the Short ID QR above is what Receive opens with. */}
        {!hasAmount ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.receiveQr.withAmount}
            onPress={() => navigation.navigate('ReceiveAmount')}
            style={({ pressed }) => [styles.withAmount, pressed && styles.pressed]}
          >
            <GenerateQrIcon />
            <Text style={styles.withAmountText}>{t.receiveQr.withAmount}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.caption}>{t.receiveQr.caption}</Text>

      <ResultDialog
        visible={outcome !== null}
        mood={outcome?.mood ?? 'success'}
        title={outcome?.title ?? ''}
        message={outcome?.message ?? ''}
        buttonLabel={outcome?.mood === 'fail' ? t.common.ok : t.common.done}
        onDismiss={() => setOutcome(null)}
      />
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
