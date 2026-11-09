import { setAccountPhone } from './accountPhone';
import { registerAccount, type RegisteredAccount } from './api/accounts';
import { ApiError } from './api/client';
import { checkUser } from './api/users';
import { reportError } from './errorReporting';
import { getSignupSession } from './signupSession';
import { markDeviceWalletRegistered } from './wallet/deviceWallet';
import type { AccountProfile } from '../context/AuthContext';

/** The sign-up data is gone (app restarted, or the session was cleared): the user must start from the phone number. */
export class SignupIncompleteError extends Error {
  constructor() {
    super('The sign-up session is no longer available.');
    this.name = 'SignupIncompleteError';
  }
}

/** The server's per-field validation messages, when it sent any. */
export function fieldErrorText(error: ApiError): string | null {
  const fields = error.data?.fieldErrors;
  if (!fields || typeof fields !== 'object') return null;
  const messages = Object.values(fields).filter((v): v is string => typeof v === 'string');
  return messages.length > 0 ? messages.join(' ') : null;
}

/**
 * Creates the account on the server. This is the only place that does, and it runs on the last onboarding
 * screen, so an abandoned sign-up never leaves a phone number registered.
 *
 * If the server already holds an account for this phone with *our* key, an earlier attempt succeeded but its
 * response was lost, so that counts as success.
 *
 * Returns the profile for `login`. The caller clears the session once it has logged in.
 */
export async function completeSignup(signal: AbortSignal): Promise<AccountProfile> {
  const session = getSignupSession();
  if (!session?.details || !session.pin || !session.keys) throw new SignupIncompleteError();
  const { details, keys, pin, phone } = session;

  let account: Pick<RegisteredAccount, 'shortId' | 'stellarPublicKey'>;
  try {
    account = await registerAccount(
      {
        stellarPublicKey: keys.publicKey,
        offlineDeviceKey: keys.offlineDeviceKey,
        phoneNumber: phone,
        pin,
        firstName: details.firstName,
        lastName: details.lastName,
        email: details.email,
        verificationToken: session.verificationToken,
      },
      signal,
    );
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) throw e;
    const existing = await checkUser(phone, signal);
    if (!(existing.exists && existing.stellarPublicKey === keys.publicKey)) throw e;
    account = existing;
  }

  await markDeviceWalletRegistered().catch((e) => reportError(e, { step: 'markDeviceWalletRegistered' }));
  await setAccountPhone(phone);
  return {
    shortId: account.shortId,
    stellarPublicKey: account.stellarPublicKey,
    firstName: details.firstName,
    lastName: details.lastName,
    phone,
  };
}
