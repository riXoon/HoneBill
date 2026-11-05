import crypto from 'node:crypto';

/** Reads the body once and stops buffering as soon as the byte limit is exceeded. */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes = 2048,
): Promise<{ rawBody: string; exceeded: boolean }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
      await request.body?.cancel().catch(() => undefined);
      return { rawBody: '', exceeded: true };
    }
  }
  if (!request.body) return { rawBody: '', exceeded: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { rawBody: '', exceeded: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { rawBody: Buffer.concat(chunks).toString('utf8'), exceeded: false };
}

/** Verify the exact raw TextBee body using HMAC-SHA256 and a timing-safe compare. */
export function verifyTextbeeHmac(
  rawBody: string | Uint8Array,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const cleanSignature = signatureHeader.replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(cleanSignature)) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const incoming = Buffer.from(cleanSignature, 'hex');
    return incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected);
  } catch {
    return false;
  }
}

/** Allows absent gateway timestamps but rejects malformed values or timestamps outside the drift window. */
export function verifyTimestampDrift(
  timestampHeader: string | null | undefined,
  maxDriftSec = 300,
  nowMs = Date.now(),
): { valid: boolean; reason?: string } {
  if (timestampHeader === null || timestampHeader === undefined || timestampHeader.trim() === '') {
    return { valid: true };
  }
  const raw = timestampHeader.trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, reason: `Unparseable timestamp: "${raw}"` };
  }
  const timestampSec = raw.length >= 13 ? parsed / 1000 : parsed;
  const driftSec = Math.abs(nowMs / 1000 - timestampSec);
  if (driftSec > maxDriftSec) {
    return {
      valid: false,
      reason: `Timestamp drift ${driftSec.toFixed(1)}s exceeds ±${maxDriftSec}s tolerance`,
    };
  }
  return { valid: true };
}

/** Masks a phone number before it is included in application logs. */
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length < 7) return '[REDACTED]';
  const prefix = digits.startsWith('+') ? digits.slice(0, digits.length > 11 ? 4 : 3) : digits.slice(0, 3);
  const suffix = digits.slice(-4);
  const maskLength = digits.length - prefix.length - 4;
  return maskLength <= 0 ? `${prefix}${suffix}` : `${prefix}${'*'.repeat(maskLength)}${suffix}`;
}

const SECRET_PATTERNS = [
  /S[A-Za-z0-9]{55}/g,
  /sig_[A-Za-z0-9_-]+/g,
  /Bearer [A-Za-z0-9._-]+/g,
];

/** Removes known secret formats from one log string before recursive sanitization returns it. */
function redactSecretString(value: string): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, '[REDACTED]'), value);
}

/** Redacts known Stellar seeds, QStash keys, and bearer tokens in structured logs. */
export function sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (typeof value === 'string') return [key, redactSecretString(value)];
    if (Array.isArray(value)) {
      return [key, value.map((item) =>
        typeof item === 'string'
          ? redactSecretString(item)
          : item !== null && typeof item === 'object'
            ? sanitizeLogData(item as Record<string, unknown>)
            : item,
      )];
    }
    if (value !== null && typeof value === 'object') {
      return [key, sanitizeLogData(value as Record<string, unknown>)];
    }
    return [key, value];
  }));
}
