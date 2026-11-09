const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const VALID_SHORT_ID = /^[0-9A-Za-z]{6}$/;

export function shortIdToBuffer(value: unknown, field = 'shortId'): Buffer {
  const shortId = typeof value === 'string' ? value.trim() : '';
  if (!VALID_SHORT_ID.test(shortId)) {
    throw new Error(`${field} must be exactly 6 case-sensitive Base62 characters`);
  }
  return Buffer.from(shortId, 'ascii');
}

export function generateBase62Id(length = 6): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHABET.length);
    value += ALPHABET[randomIndex];
  }
  return value;
}
