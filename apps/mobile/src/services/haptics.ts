import { Platform, Vibration } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';

/**
 * Haptic feedback through `expo-haptics` (Taptic Engine on iOS, the system haptic effects on Android). The package is a
 * native module, so a build made before it was added does not contain it; then Android falls back to a plain
 * vibration and iOS stays silent, and nothing throws.
 */
const hasHaptics = requireOptionalNativeModule('ExpoHaptics') !== null;

function run(effect: () => Promise<void>, fallbackMs: number): void {
  if (hasHaptics) {
    effect().catch(() => {});
    return;
  }
  if (Platform.OS === 'android') {
    try {
      Vibration.vibrate(fallbackMs);
    } catch {
      // No vibrator, or the user turned it off.
    }
  }
}

/** A completed swipe or a firm tap: a medium impact. */
export function confirmHaptic(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 40);
}

/** Something finished well (a transfer went through). */
export function successHaptic(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 60);
}

/** Something failed or was refused. */
export function errorHaptic(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 120);
}
