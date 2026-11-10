import type { SendMode } from '../types/send';
import { useIsOnline } from './useIsOnline';

/**
 * The funds a Send step uses: the view the payment was started from. Entry points that do not choose one (scanning a
 * QR code) fall back to the connection, so a phone with no internet can only pay by voucher.
 */
export function useSendMode(requested?: SendMode): SendMode {
  const connected = useIsOnline();
  return requested ?? (connected ? 'online' : 'offline');
}
