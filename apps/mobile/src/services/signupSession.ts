/**
 * What the sign-up steps hand to each other. Memory only: the OTP proof is short-lived and the
 * MPIN must not be written to disk. `register` (MpinCreationScreen) reads it on the last step and clears it.
 */
export type SignupDetails = { firstName: string; lastName: string; email: string };

export type SignupSession = {
  phone: string;
  verificationToken?: string;
  details?: SignupDetails;
};

let current: SignupSession | null = null;

/** Starts a fresh session (a new phone verification discards anything gathered before). */
export function setSignupSession(session: SignupSession): void {
  current = session;
}

export function getSignupSession(): SignupSession | null {
  return current;
}

export function setSignupDetails(details: SignupDetails): void {
  if (current) current = { ...current, details };
}

export function clearSignupSession(): void {
  current = null;
}
