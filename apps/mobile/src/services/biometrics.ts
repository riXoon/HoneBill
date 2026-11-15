import * as LocalAuthentication from 'expo-local-authentication';
import { messages } from '../i18n';

/** True when the phone has a fingerprint/face sensor with at least one enrolled biometric. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

/**
 * Asks the OS for a fingerprint/face check. The device passcode fallback is off so the only other
 * way in stays the MPIN. Resolves false on cancel, lockout or any error, never throws.
 */
export async function authenticateWithBiometrics(promptMessage = messages().biometric.prompt): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: messages().biometric.useMpin,
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
