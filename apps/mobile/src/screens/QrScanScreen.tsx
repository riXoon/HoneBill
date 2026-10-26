import { useCallback, useEffect, useRef } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
import type { RootStackParamList } from '../navigation/types';
import { colors, fonts } from '../theme';

// Figma: QR Scan (870:3349), 402x874.
export function QrScanScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'QrScan'>) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const granted = permission?.granted === true;
  const blocked = permission != null && !permission.granted && !permission.canAskAgain;

  // Ask once on arrival; if the user said "don't ask again" the hint points them to Settings instead.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const onScanned = useCallback(({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    // Mock: the Send flow is not built yet, so just surface what was read.
    Alert.alert('QR code scanned', data, [{ text: 'OK', onPress: () => (handled.current = false) }], {
      onDismiss: () => (handled.current = false),
    });
  }, []);

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
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <ChevronLeftIcon />
          </Pressable>
          <View style={styles.title}>
            <Text style={styles.titleText} accessibilityRole="header">
              Scan the QR Code
            </Text>
            <QrTitleIcon />
          </View>
        </View>

        <View style={styles.modeRow}>
          <View style={styles.modePill}>
            <View style={styles.modeDot} />
            <Text style={styles.modeText}>Send via offline</Text>
          </View>
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
              {blocked ? 'Camera access is off. Tap to open Settings.' : 'Point your camera at the QR code to scan.'}
            </Text>
          </Pressable>

          <View style={styles.actions}>
            {/* A code needs an amount first, so this opens Receive 1, which leads on to Receive 2 - My QR. */}
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ReceiveAmount')} style={styles.generate}>
              <GenerateQrIcon />
              <Text style={styles.generateText}>Generate QR</Text>
            </Pressable>
            {/* Picking a QR from the gallery needs an image picker plus a decoder; not wired yet. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Upload QR from gallery" style={styles.gallery}>
              <GalleryIcon />
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
  titleText: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
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
  modeText: { fontFamily: fonts.light, fontSize: 12, color: colors.textMuted },
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
    alignItems: 'flex-end',
    borderRadius: 16,
    overflow: 'hidden',
    height: SCAN_FRAME_HEIGHT + 60,
  },
  frame: { position: 'absolute', top: 30, right: 30 },
  // The orb is centred on the panel's top edge.
  orb: { position: 'absolute', top: -SCAN_ORB_SIZE / 2, left: 0, right: 0, alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10 },
  hintText: { fontFamily: fonts.medium, fontSize: 10, color: 'rgba(34, 32, 33, 0.2)' },
  actions: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 20 },
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
  generateText: { fontFamily: fonts.regular, fontSize: 15, color: colors.primary, textAlign: 'center' },
  gallery: { width: 65, alignItems: 'center', justifyContent: 'center' },
});
