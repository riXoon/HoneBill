import { apiRequest } from './client';

export type FeedbackCategory = 'payment' | 'account' | 'bug' | 'suggestion';

/** Attached by the app, never typed by the user. Nothing secret (no keys, phrase or PIN) is ever included. */
export type FeedbackContext = {
  appVersion?: string;
  platform?: string;
  online?: boolean;
  transactionRef?: string;
  transactionStatus?: string;
  transactionSource?: string;
  transactionAmount?: number;
  transactionAsset?: string;
  transactionNonce?: string;
  failureReason?: string;
  transactionTime?: string;
};

export type FeedbackReport = {
  /** Made once per report, so a retried send is stored once. */
  clientId: string;
  category: FeedbackCategory;
  message: string;
  shortId?: string;
  context?: FeedbackContext;
};

/** Sends a Help & Feedback report. One-way: the answer only says it was received. */
export function submitFeedback(report: FeedbackReport, signal?: AbortSignal): Promise<{ success: true }> {
  return apiRequest('POST', '/feedback', { body: report, signal, timeoutMs: 10_000 });
}
