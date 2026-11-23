import { createHash } from 'node:crypto';

export function stellarNetworkId(passphrase: string): string {
  return createHash('sha256').update(passphrase).digest('hex');
}
