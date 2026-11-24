const CONTRACT_ERROR_PATTERN = /Error\s*\(\s*Contract\s*,\s*#?(\d+)\s*\)/i;

export function contractErrorCode(message: string): number | undefined {
  const match = CONTRACT_ERROR_PATTERN.exec(message);
  return match ? Number(match[1]) : undefined;
}
const RETRYABLE_PATTERNS = [
  'status: 429', 'status: 502', 'status: 503', 'status: 504',
  'too many requests', 'rate limit', 'bad gateway', 'service unavailable',
  'gateway timeout', 'econnrefused', 'etimedout', 'econnreset', 'socket hang up',
  'fetch failed', 'failed to fetch', 'network error', 'connection refused',
  'connection reset', 'connect timeout', 'read timeout', 'write timeout', 'epipe',
  'tx_bad_seq', 'tx_insufficient_fee', 'timeout',
];

export function isRetryableSettlementError(error: unknown): boolean {
  if (!(error instanceof Error) || CONTRACT_ERROR_PATTERN.test(error.message)) return false;
  const message = error.message.toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

export function normalizeSettlementFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('verify_sig_ed25519') || message.includes('failed ED25519 verification')) {
    return 'Offline device key mismatch: the voucher signature is invalid for the registered key. Re-sync with an authenticated set_offline_key call.';
  }
  const trustline = message.match(/trustline entry is missing for account["\s,]+(G[A-Z2-7]{55})/);
  if (trustline?.[1]) return `Missing token trustline for account ${trustline[1]}. Create a trustline before retrying.`;
  if (CONTRACT_ERROR_PATTERN.test(message)) return `Contract rejection: ${message.slice(0, 200)}`;
  return message.slice(0, 500);
}

export function normalizeSettlementUserFailure(error: unknown): string {
  if (!error) return '';
  const message = error instanceof Error ? error.message : String(error);
  const contractError = contractErrorCode(message);
  if (contractError !== undefined) {
    const labels: Record<number, string> = {
      2: 'Unauthorized transaction.', 3: 'Invalid transaction amount.',
      4: 'Voucher has expired.', 5: 'Voucher has already been used.',
      6: 'Insufficient balance.', 7: 'Recipient was not found.',
      9: 'Unauthorized relayer.', 12: 'Invalid recipient ID.',
    };
    return labels[contractError] ?? 'Transaction rejected by contract.';
  }
  if (/insufficientbalance|insufficient balance/i.test(message)) return 'Insufficient balance.';
  if (/noncereplayed|nonce replayed/i.test(message)) return 'Voucher has already been used.';
  if (/expiredvoucher|expired voucher/i.test(message)) return 'Voucher has expired.';
  if (message.includes('verify_sig_ed25519') || message.includes('failed ED25519 verification') || /invalid.*signature/i.test(message)) return 'Invalid voucher signature.';
  if (/offline device key/i.test(message)) return 'Offline device key is not enrolled.';
  if (/trustline/i.test(message)) return 'Missing token trustline.';
  if (/recipient.*not found/i.test(message)) return 'Recipient was not found.';
  const sender = message.match(/account not found:\s*([a-zA-Z0-9]+)/i);
  if (sender?.[1]) return `Sender account ${sender[1]} is not registered.`;
  if (/sender account.*not registered|account not found/i.test(message)) return 'Sender account is not registered.';
  return '';
}
