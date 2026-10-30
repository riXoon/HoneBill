const CONTRACT_ERROR = /Error\s*\(\s*Contract\s*,\s*\d+\s*\)/i;
const RETRYABLE = [
  'status: 429', 'status: 502', 'status: 503', 'status: 504',
  'too many requests', 'rate limit', 'bad gateway', 'service unavailable',
  'gateway timeout', 'econnrefused', 'etimedout', 'econnreset', 'socket hang up',
  'fetch failed', 'failed to fetch', 'network error', 'connection refused',
  'connection reset', 'connect timeout', 'read timeout', 'write timeout', 'epipe',
  'tx_bad_seq', 'tx_insufficient_fee', 'timeout',
];

export function isRetryableSettlementError(error: unknown): boolean {
  if (!(error instanceof Error) || CONTRACT_ERROR.test(error.message)) return false;
  const message = error.message.toLowerCase();
  return RETRYABLE.some((pattern) => message.includes(pattern));
}
