import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCAN_FRAME_HEIGHT, ScanFrame } from '../components/qr/ScanFrame';
import { AppBackground } from '../components/ui/AppBackground';
import { SCAN_ORB_SIZE, ScanOrb } from '../components/ui/ScanOrb';
import {
  ChevronLeftIcon,
  GalleryIcon,
  GenerateQrIcon,
  InfoIcon,
  QrTitleIcon,
} from '../components/ui/smallIcons';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { MissingGatewayError, openGatewaySms, parseRelayVoucher } from '../services/offline/voucherFormat';
import {
  parseRecipientQr,
  parseRecipientQrAmount,
  resolveRecipient,
  unverifiedRecipient,
} from '../services/recipientDirectory';
import { useIsOnline } from '../hooks/useIsOnline';
import { useSendMode } from '../hooks/useSendMode';
import type { Recipient } from '../types/recipient';
import type { SendMode } from '../types/send';
import { colors, fonts } from '../theme';
import { messages, useT } from '../i18n';

function qrPayload({ raw, data }: BarcodeScanningResult): string {
  // Android can reformat structured QR codes in `data`, including the SMS wrapper on relay vouchers.
  return raw || data;
}

// Figma: QR Scan (870:3349), 402x874.
export function QrScanScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'QrScan'>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { activeAccount } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  // Online spends the online wallet and settles now; Offline spends the vault and makes a voucher. Opened from Send it
  // is fixed by that choice; from the tab bar it follows the connection, and the pill lets the user switch.
  const initialMode = useSendMode(route.params?.mode);
  const [chosenMode, setChosenMode] = useState<SendMode | null>(null);
  const mode: SendMode = chosenMode ?? initialMode;
  const connected = useIsOnline();
  const [uploading, setUploading] = useState(false);

  const granted = permission?.granted === true;
  const blocked = permission != null && !permission.granted && !permission.canAskAgain;

  // Ask once on arrival; if the user said "don't ask again" the hint points them to Settings instead.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const lookup = useRef<AbortController | null>(null);
  /** True while a scanned code is being looked up, so the screen does not look frozen after a scan. */
  const [checking, setChecking] = useState(false);
  useEffect(() => () => lookup.current?.abort(), []);

  // After relaying a voucher the user is in their messaging app. Unlock scanning only a moment after they come back,
  // so a camera still pointed at the sender's QR does not open a second text straight away.
  const relayReturn = useRef<(() => void) | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !relayReturn.current) return;
      const release = relayReturn.current;
      relayReturn.current = null;
      timer = setTimeout(release, 2000);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  /** Handles the text of a QR code, whether it came from the camera or from an uploaded image. */
  const handleCode = useCallback(
    async (data: string) => {
      if (handled.current) return;
      handled.current = true;
      const release = () => (handled.current = false);

      // A partner's signed voucher ("Get Help Sending"): text it to the gateway for them. It is already signed, so this
      // phone only carries it; the user just taps Send in their messaging app.
      const relayed = parseRelayVoucher(data);
      if (relayed) {
        try {
          relayReturn.current = release;
          await openGatewaySms(relayed.text);
        } catch (error) {
          relayReturn.current = null;
          const noGateway = error instanceof MissingGatewayError;
          if (!noGateway) reportError(error, { step: 'relayVoucherSms' });
          Alert.alert(
            messages().qrScan.relayFailedTitle,
            noGateway ? messages().qrScan.relayNoGatewayBody : messages().qrScan.relayFailedBody,
            [{ text: messages().common.ok, onPress: release }],
            { onDismiss: release },
          );
        }
        return;
      }

      const shortId = parseRecipientQr(data);
      if (!shortId) {
        // Development builds only: the raw text, to see why a code was not recognised (a voucher holds no secrets).
        if (__DEV__) console.log('[qrScan] unrecognised code', JSON.stringify(data));
        Alert.alert(messages().qrScan.notHoneBillTitle, messages().qrScan.notHoneBillBody, [{ text: messages().common.ok, onPress: release }], {
          onDismiss: release,
        });
        return;
      }
      if (shortId === activeAccount?.shortId) {
        Alert.alert(messages().qrScan.ownTitle, messages().qrScan.ownBody, [{ text: messages().common.ok, onPress: release }], {
          onDismiss: release,
        });
        return;
      }

      const goToAmount = (recipient: Recipient) => {
        // An unchecked recipient can only be paid by voucher, whatever the pill says.
        const payMode: SendMode = recipient.unverified ? 'offline' : mode;
        const amount = parseRecipientQrAmount(data);
        navigation.navigate(
          'SendAmount',
          amount ? { recipientId: recipient.id, mode: payMode, amount } : { recipientId: recipient.id, mode: payMode },
        );
        // Stay locked so the camera cannot re-fire; coming back to this screen is a fresh scan.
        setTimeout(release, 1500);
      };

      // No connection: a scanned HoneBill code cannot carry a typo, so it is paid by voucher without a lookup (and
      // without the typed-ID warning). Someone already known on this phone keeps their name.
      if (!connected) {
        if (mode === 'offline') goToAmount(unverifiedRecipient(shortId));
        else {
          Alert.alert(
            messages().qrScan.offlineTitle,
            messages().qrScan.offlineBody,
            [{ text: messages().common.ok, onPress: release }],
            { onDismiss: release },
          );
        }
        return;
      }

      const controller = new AbortController();
      lookup.current = controller;
      setChecking(true);
      try {
        const recipient = await resolveRecipient(shortId, controller.signal);
        if (recipient) {
          goToAmount(recipient);
          return;
        }
        Alert.alert(messages().qrScan.noAccountTitle, messages().qrScan.noAccountBody, [{ text: messages().common.ok, onPress: release }], {
          onDismiss: release,
        });
      } catch (e) {
        if (isAborted(e)) return;
        // The phone looked connected but the request never got through (weak signal): treat it as offline.
        const unreachable = e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout');
        if (unreachable && mode === 'offline') {
          goToAmount(unverifiedRecipient(shortId));
          return;
        }
        Alert.alert(messages().qrScan.checkFailed, errorMessage(e), [{ text: messages().common.ok, onPress: release }], { onDismiss: release });
      } finally {
        setChecking(false);
      }
    },
    [activeAccount?.shortId, navigation, mode, connected],
  );

  const onScanned = useCallback((result: BarcodeScanningResult) => void handleCode(qrPayload(result)), [handleCode]);

  // A saved QR card (from a gallery) for someone who is not in front of the sender.
  const uploadFromGallery = async () => {
    if (uploading || handled.current) return;
    setUploading(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (picked.canceled || !picked.assets[0]) return;
      const results = await Camera.scanFromURLAsync(picked.assets[0].uri, ['qr']);
      const payloads = results.map(qrPayload);
      const code = payloads.find((payload) => parseRecipientQr(payload) || parseRelayVoucher(payload)) ?? payloads[0];
      if (!code) {
        Alert.alert(messages().qrScan.noQrTitle, messages().qrScan.noQrBody);
        return;
      }
      await handleCode(code);
    } catch {
      Alert.alert(messages().qrScan.readFailedTitle, messages().qrScan.readFailedBody);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(70, insets.top + 24), paddingBottom: Math.max(24, insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.common.back}
            hitSlop={8}
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <ChevronLeftIcon />
          </Pressable>
          <View style={styles.title}>
            <Text style={styles.titleText} accessibilityRole="header">
              {t.qrScan.title}
            </Text>
            <QrTitleIcon />
          </View>
        </View>

        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.qrScan.modeA11y(mode, mode === 'online' ? 'offline' : 'online')}
            onPress={() => setChosenMode(mode === 'online' ? 'offline' : 'online')}
            style={styles.modePill}
          >
            <View style={[styles.modeDot, { backgroundColor: mode === 'online' ? colors.statusOnline : colors.statusOffline }]} />
            <Text style={styles.modeText}>{mode === 'online' ? 'Send via online' : 'Send via offline'}</Text>
          </Pressable>
        </View>

        <View style={styles.details}>
          <View style={styles.panelWrap}>
            <View style={styles.panel}>
              {granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  active={focused}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={focused ? onScanned : undefined}
                />
              ) : null}
              <View style={styles.frame}>
                <ScanFrame showGlyph={!granted} />
              </View>
            </View>
            <View pointerEvents="none" style={styles.orb}>
              <ScanOrb />
            </View>
          </View>

          <Pressable
            disabled={granted || !blocked}
            onPress={() => void Linking.openSettings()}
            style={styles.hint}
            accessibilityRole={blocked ? 'button' : 'text'}
          >
            <InfoIcon />
            <Text style={styles.hintText}>
              {checking || uploading
                ? t.qrScan.checking
                : blocked
                  ? t.qrScan.cameraOff
                  : t.qrScan.point}
            </Text>
          </Pressable>

          <View style={styles.actions}>
            {/* Opens My QR with the Short ID straight away; an amount can be added from there. */}
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ReceiveQr')} style={styles.generate}>
              <GenerateQrIcon />
              <Text style={styles.generateText}>Generate QR</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.qrScan.uploadA11y}
              accessibilityState={{ disabled: uploading, busy: uploading }}
              onPress={() => void uploadFromGallery()}
              style={[styles.generate, uploading && { opacity: 0.5 }]}
            >
              <GalleryIcon color={colors.primary} size={24} />
              <Text style={styles.generateText}>{uploading ? t.qrScan.reading : 'Upload QR'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 30, gap: 20 },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(247, 247, 251, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { fontFamily: fonts.regular, fontSize: 18, color: colors.text },
  modeRow: { height: 60, alignItems: 'center' },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: colors.placeholderTint,
  },
  modeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textMuted },
  modeText: { fontFamily: fonts.light, fontSize: 14, color: colors.textMuted },
  details: { gap: 12 },
  // The shadow lives on this wrapper because overflow:hidden on the panel would clip it on iOS.
  panelWrap: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#000000',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 6,
  },
  // Figma "Scan": pure black, 30 dp padding around the 282.6 x 303.8 frame, soft #D3D3D3 shadow.
  panel: {
    width: '100%',
    padding: 30,
    borderRadius: 16,
    overflow: 'hidden',
    height: SCAN_FRAME_HEIGHT + 60,
  },
  // Centred (not right-anchored) so the brackets stay symmetric on screens wider or narrower than 402 dp.
  frame: { position: 'absolute', top: 30, left: 0, right: 0, alignItems: 'center' },
  // The orb is centred on the panel's top edge.
  orb: { position: 'absolute', top: -SCAN_ORB_SIZE / 2, left: 0, right: 0, alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10 },
  hintText: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(34, 32, 33, 0.2)' },
  actions: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 12 },
  generate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceTranslucent,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 2,
  },
  generateText: { fontFamily: fonts.regular, fontSize: 17, color: colors.primary, textAlign: 'center' },
});
