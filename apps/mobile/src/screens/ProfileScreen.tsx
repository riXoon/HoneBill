import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { LogoWatermark } from '../components/brand/LogoWatermark';
import { AppBackground } from '../components/ui/AppBackground';
import { NAV_BAR_HEIGHT } from '../components/ui/BottomNavBar';
import { ProfileIcon } from '../components/ui/navIcons';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ChevronRightIcon, CopyIcon, GearIcon, LockIcon, LogoutIcon, VaultIcon, WalletIcon } from '../components/ui/smallIcons';
import { fullName, useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { isValidStellarPublicKey } from '../services/wallet/stellarKeys';
import { colors, fonts } from '../theme';

// Figma: Profile (942:5362), 402x874. Positions below are read off the frame, relative to the
// 342 dp column that starts under the title row (frame y 130).
const honiProfile = require('../../assets/mascot/honi-profile.png');
// Baked from the Figma gradient stack by scripts/generate-profile-arch.js (one bitmap, no live gradients).
const archImage = require('../../assets/profile/arch.png');
const ARCH_WIDTH = 575;
const ARCH_HEIGHT = 534;

/** Figma "Nav icons" avatar glyph (73 dp, white) inside the orange disc. */
function AvatarGlyph() {
  return (
    <Svg width={73} height={73} viewBox="0 0 73 73">
      <Path
        fill={colors.surface}
        d="M36.5718 8.81034C54.683 8.81093 69.3665 23.4927 69.3667 41.6043C69.3666 48.1668 67.4356 54.2861 64.1108 59.4158C61.9219 62.7928 58.4162 63.6651 55.1714 63.3455C52.0092 63.0337 48.7843 61.6014 46.23 59.9529C43.6367 58.2792 40.548 57.3075 37.2261 57.3074C33.6645 57.3075 30.3709 58.4251 27.6675 60.3279C25.1808 62.0783 22.0148 63.638 18.8667 64.0769C15.6364 64.527 12.0976 63.7972 9.77391 60.5105C5.99686 55.1674 3.77591 48.6414 3.77586 41.6043C3.776 23.4926 18.4602 8.81064 36.5718 8.81034ZM36.8638 23.5398C29.9797 23.5402 24.3981 29.1214 24.3979 36.0057L24.4145 36.6473C24.7487 43.2333 30.1949 48.4712 36.8638 48.4715C43.5328 48.4712 48.9799 43.2332 49.3139 36.6473L49.3296 36.0057C49.3294 29.1215 43.7479 23.5402 36.8638 23.5398Z"
      />
    </Svg>
  );
}

type MenuRowProps = {
  icon: ReactNode;
  label: string;
  trailing: ReactNode;
  onPress?: () => void;
  /** Lavender fill of the vault address row. */
  tinted?: boolean;
  accessibilityLabel?: string;
};

/** Figma "method-gcash" row: 30 dp icon slot, 10 dp medium label at 50%, trailing control. */
function MenuRow({ icon, label, trailing, onPress, tinted, accessibilityLabel }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, tinted && styles.rowTinted, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { activeAccount, logout } = useAuth();
  // Only a well-formed address (right length, alphabet, version and checksum) is shown or copied: anything else
  // would send money to a key nobody owns.
  const stored = activeAccount?.stellarPublicKey ?? '';
  const address = isValidStellarPublicKey(stored) ? stored : '';
  // Shortened the way the design prints it: start, ellipsis, end. The copy always takes the full address.
  const addressShort = address ? `${address.slice(0, 12)}...${address.slice(-10)}` : 'Vault address unavailable';
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const signOut = async () => {
    await logout();
    // The tabs live inside the root stack, so reset from the parent navigator.
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1800);
    AccessibilityInfo.announceForAccessibility('Vault address copied');
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(70, insets.top + 24), paddingBottom: NAV_BAR_HEIGHT + Math.max(24, insets.bottom) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          icon={<ProfileIcon color={colors.coral} size={40} />}
          title="Profile"
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              hitSlop={7}
              onPress={signOut}
              style={styles.logout}
            >
              <LogoutIcon />
            </Pressable>
          }
        />

        <View style={styles.block}>
          {/* Layer order follows Figma: arch, ghosted logo, Honi, then the avatar and card on top. */}
          <Image source={archImage} style={styles.arch} contentFit="fill" pointerEvents="none" />
          <View pointerEvents="none" style={styles.logo}>
            <LogoWatermark />
          </View>
          <View pointerEvents="none" style={styles.honiFrame}>
            <View style={styles.honiTilt}>
              <Image source={honiProfile} style={styles.honiImage} contentFit="cover" accessibilityLabel="Honi, the HoneBill mascot" />
            </View>
          </View>

          <View style={styles.identity}>
            <View style={styles.avatar}>
              <View style={styles.avatarInner}>
                <View style={styles.avatarGlyph}>
                  <AvatarGlyph />
                </View>
              </View>
            </View>
            <View style={styles.details}>
              <Text style={styles.name}>{fullName(activeAccount)}</Text>
              <Text style={styles.phone}>{activeAccount?.phone ? formatPhoneDisplay(activeAccount.phone) : ''}</Text>
              <View style={styles.walletIdBox}>
                <Text style={styles.walletId}>
                  <Text style={styles.walletIdLabel}>Short ID</Text>: {activeAccount?.shortId ?? ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.menu}>
            <MenuRow
              icon={<View style={styles.gear}><GearIcon /></View>}
              label="Account Settings"
              trailing={<ChevronRightIcon />}
            />
            <MenuRow icon={<View style={styles.glyph}><WalletIcon /></View>} label="Vault Settings" trailing={<ChevronRightIcon />} />
            <MenuRow icon={<View style={styles.glyph}><LockIcon /></View>} label="Change MPIN" trailing={<ChevronRightIcon />} />
            <MenuRow
              tinted
              icon={<View style={styles.glyph}><VaultIcon /></View>}
              label={copied ? 'Address copied!' : addressShort}
              accessibilityLabel={address ? 'Copy vault address' : 'Vault address unavailable'}
              onPress={address ? copyAddress : undefined}
              trailing={<CopyIcon color={copied ? colors.primary : colors.textMuted} />}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 30, gap: 20 },
  logout: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  // 342 x 397 column; the arch, Honi and logo overflow it and the ScrollView clips them at the screen edge.
  block: { width: '100%', height: 397 },
  arch: { position: 'absolute', top: 41, left: '50%', marginLeft: -ARCH_WIDTH / 2, width: ARCH_WIDTH, height: ARCH_HEIGHT },
  logo: { position: 'absolute', top: 446, left: '50%', marginLeft: -48 },
  honiFrame: { position: 'absolute', left: -84.36, top: 428.32, width: 233.956, height: 197.686, alignItems: 'center', justifyContent: 'center' },
  // Figma flips the picture vertically and rotates it -164.26 degrees.
  honiTilt: { width: 201.167, height: 148.701, transform: [{ rotate: '-164.26deg' }, { scaleY: -1 }] },
  honiImage: { position: 'absolute', left: -3, top: 4.22, width: 207.17, height: 140.25 },
  identity: { position: 'absolute', top: 0, left: '50%', marginLeft: -95, width: 190, alignItems: 'center', gap: 22 },
  avatar: {
    width: 102,
    height: 102,
    borderRadius: 1000,
    borderWidth: 6,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
  },
  avatarInner: { width: 90, height: 90 },
  avatarGlyph: { position: 'absolute', left: 8, top: 4, width: 73, height: 73 },
  details: { alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.bold, fontSize: 17, color: colors.white },
  phone: { fontFamily: fonts.regular, fontSize: 13, color: colors.white },
  walletIdBox: { height: 27, justifyContent: 'flex-end' },
  walletId: { fontFamily: fonts.regular, fontSize: 10, color: colors.white },
  walletIdLabel: { fontFamily: fonts.bold },
  menu: {
    position: 'absolute',
    top: 209,
    left: '50%',
    marginLeft: -151,
    width: 302,
    gap: 4,
    padding: 16,
    borderRadius: 12,
    // Translucent over the arch. No shadow: a soft grey shadow is barely visible on the red and, behind a
    // translucent fill, it only adds a grey cast and an offscreen pass on Android.
    backgroundColor: 'rgba(247, 247, 251, 0.7)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 6, borderRadius: 6 },
  rowTinted: { backgroundColor: colors.placeholderTint },
  rowPressed: { opacity: 0.7 },
  rowIcon: { width: 30, height: 30 },
  gear: { position: 'absolute', left: 4.69, top: 4.67 },
  glyph: { position: 'absolute', left: 3, top: 3 },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 10, color: colors.textMuted },
});
