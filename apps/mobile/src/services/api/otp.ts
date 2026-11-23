import { messages } from '../../i18n';
import { apiRequest, UserFacingError } from './client';

export type OtpPurpose = 'signup' | 'recover_device' | 'change_mpin' | 'reset_mpin' | 'change_email';

export type VerifyOtpResult = {
  success: true;
  message: string;
  verificationToken: string;
  expiresIn?: number;
};

/** Texts a one-time code to `phone` (E.164, e.g. +639123456789). */
export function sendOtp(phone: string, purpose: OtpPurpose, signal?: AbortSignal): Promise<{ success: true; message: string }> {
  return apiRequest('POST', '/otp/send', { body: { phoneNumber: phone, purpose }, signal });
}

export async function verifyOtp(phone: string, code: string, purpose: OtpPurpose, signal?: AbortSignal): Promise<VerifyOtpResult> {
  const result = await apiRequest<VerifyOtpResult>('POST', '/otp/verify', { body: { phoneNumber: phone, code, purpose }, signal });
  if (typeof result.verificationToken !== 'string' || !result.verificationToken.trim()) {
    throw new UserFacingError(messages().errors.generic);
  }
  return result;
}
