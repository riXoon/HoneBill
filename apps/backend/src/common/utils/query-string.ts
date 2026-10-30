export function queryString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const firstValue = Array.isArray(value) ? value[0] : value;
  return typeof firstValue === 'string' ? firstValue : undefined;
}