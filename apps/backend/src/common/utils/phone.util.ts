export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('09') && cleaned.length === 11) {
    return `+63${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith('63') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function toDbPhone(phone: string): string {
  return normalizePhoneNumber(phone).replace(/\D/g, '');
}

export function isPlausiblePhone(phone: string): boolean {
  const digits = toDbPhone(phone);
  return digits.length >= 8 && digits.length <= 15;
}
