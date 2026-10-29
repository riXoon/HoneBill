export const DEFAULT_SEP10_JWT_TTL_SECONDS = 86400;

/**
 * Parses SEP10_JWT_TIMEOUT (seconds). Unset or blank gives the default.
 * Anything that is not a positive integer throws, so a bad value fails at boot
 * instead of producing tokens that expire immediately or fail to sign.
 * Accepts a number too, in case the env schema already coerced it.
 */
export function parseTtl(
  raw: string | number | undefined | null,
  variableName = 'SEP10_JWT_TIMEOUT',
  defaultSeconds = DEFAULT_SEP10_JWT_TTL_SECONDS,
): number {
  if (raw === undefined || raw === null) return defaultSeconds;
  if (typeof raw === 'string' && raw.trim() === '') return defaultSeconds;

  const value = typeof raw === 'number' ? raw : Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${variableName} must be a positive integer (seconds)`);
  }
  return value;
}