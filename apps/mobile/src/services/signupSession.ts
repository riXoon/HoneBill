/**
 * What the sign-up steps hand to each other. Memory only: the OTP proof is short-lived and the
 * MPIN must not be written to disk. Nothing is sent to the server until the last onboarding screen
 * (AccountConfirmationScreen) calls `completeSignup`, which reads this and then clears it; quitting
 * earlier therefore leaves no account behind.
 */
export type SignupDetails = { firstName: string; lastName: string; email: string };

/** The public addresses of the wallet created on this device (its secrets stay in the keystore). */
export type SignupKeys = { publicKey: string; offlineDeviceKey: string };

export type SignupSession = {
  phone: string;
  verificationToken: string;
  details?: SignupDetails;
  pin?: string;
  keys?: SignupKeys;
};

let current: SignupSession | null = null;

/** Starts a fresh session (a new phone verification discards anything gathered before). */
export function setSignupSession(session: SignupSession): void {
  current = session;
}

export function getSignupSession(): SignupSession | null {
  return current;
}

/** Re-verifies the same signup without replacing the generated wallet or form data. */
export function refreshSignupProof(phone: string, verificationToken: string): boolean {
  if (current?.phone !== phone) return false;
  current = { ...current, verificationToken };
  return true;
}

export function setSignupDetails(details: SignupDetails): void {
  if (current) current = { ...current, details };
}

/** Set by the MPIN step: the PIN to register with and the keys of the wallet it created. */
export function setSignupSecurity(pin: string, keys: SignupKeys): void {
  if (current) current = { ...current, pin, keys };
}

export function clearSignupSession(): void {
  current = null;
}
