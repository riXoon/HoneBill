import { apiRequest } from './client';

export type RegisterInput = {
  stellarPublicKey: string;
  /** The device's offline voucher-signing key ("G..." address). It is stored on the account row. */
  offlineDeviceKey: string;
  /** E.164, the same number the OTP was verified for. */
  phoneNumber: string;
  /** 4 to 6 digits; the server stores only a hash. */
  pin: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Proof from `/otp/verify` that this phone is the user's. */
  verificationToken?: string;
};

export type RegisteredAccount = {
  shortId: string;
  stellarPublicKey: string;
  offlineDeviceKey: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

/** Creates the account row. The PIN is stripped from the response. */
export async function registerAccount(input: RegisterInput, signal?: AbortSignal): Promise<RegisteredAccount> {
  const result = await apiRequest<{ success: true; data: RegisteredAccount }>('POST', '/register', {
    body: input,
    signal,
  });
  return result.data;
}
