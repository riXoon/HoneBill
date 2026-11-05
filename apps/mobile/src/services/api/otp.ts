import { apiRequest } from './client';

export type VerifyOtpResult = {
  success: true;
  message: string;
  /** Proof of phone ownership that `/register` takes; absent when the server has no OTP secret set. */
  verificationToken?: string;
  expiresIn?: number;
};

/** Texts a one-time code to `phone` (E.164, e.g. +639123456789). */
export function sendOtp(phone: string, signal?: AbortSignal): Promise<{ success: true; message: string }> {
  return apiRequest('POST', '/otp/send', { body: { phoneNumber: phone }, signal });
}

export function verifyOtp(phone: string, code: string, signal?: AbortSignal): Promise<VerifyOtpResult> {
  return apiRequest('POST', '/otp/verify', { body: { phoneNumber: phone, code }, signal });
}
