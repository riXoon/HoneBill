import { describe, expect, it } from '@jest/globals';
import {
  failedText,
  formatVoucherAmount,
  receivedText,
  settledText,
  smsSafeName,
  userFailureReason,
  voucherRef,
  type VoucherNotice,
} from './settlement-notice.util.js';

const notice: VoucherNotice = {
  nonce: 'a+b/C1d2e3F4==',
  senderShortId: 'abc123',
  receiverShortId: 'def456',
  amountStroops: 12_505_000_000n,
  symbol: 'PHPC',
  decimals: 7,
  receiverPhone: '+639170000000',
  senderName: null,
};

describe('settlement notices', () => {
  it('builds the short reference from the nonce letters and digits', () => {
    expect(voucherRef('a+b/C1d2e3F4==')).toBe('ABC1D2');
  });

  it('formats amounts as pesos with truncated cents', () => {
    expect(formatVoucherAmount(12_505_000_000n, 'PHPC')).toBe('PHP 1,250.50');
    expect(formatVoucherAmount(1_009_999n, 'PHPC')).toBe('PHP 0.10');
    expect(formatVoucherAmount(10_000_000n, 'USDC')).toBe('USDC 1.00');
  });

  it('names the amount, the other party and the reference in every text', () => {
    expect(settledText(notice)).toBe('HoneBill: Your offline payment of PHP 1,250.50 to ID def456 went through. Ref: ABC1D2');
    expect(receivedText(notice)).toBe('HoneBill: You received PHP 1,250.50 from ID abc123. Ref: ABC1D2');
    expect(failedText(notice, 'No account has this ID.')).toBe(
      'HoneBill: Your offline payment of PHP 1,250.50 to ID def456 did not go through. No account has this ID. No money was taken. Ref: ABC1D2',
    );
  });

  it("names the sender in the receiver's text when the account has a first name", () => {
    expect(receivedText({ ...notice, senderName: 'Ana' })).toBe(
      'HoneBill: You received PHP 1,250.50 from Ana (ID abc123). Ref: ABC1D2',
    );
  });

  it('keeps names GSM-safe: accents folded, other non-ASCII dropped, length capped', () => {
    expect(smsSafeName('Niño')).toBe('Nino');
    expect(smsSafeName('  María   José ')).toBe('Maria Jose');
    expect(smsSafeName('Ana 😀')).toBe('Ana');
    expect(smsSafeName('Bartholomew-Alexander Cruz')).toBe('Bartholomew-Alexande');
    expect(smsSafeName('李')).toBeNull();
    expect(smsSafeName(null)).toBeNull();
  });

  it('turns failures into plain reasons without leaking internals', () => {
    expect(userFailureReason(new Error('Recipient account not found'))).toBe('No account has this ID.');
    expect(userFailureReason('Recipient account not found')).toBe('No account has this ID.');
    expect(userFailureReason(new Error('HostError: Error(Contract, 6)'))).toBe('Insufficient balance.');
    expect(userFailureReason(new Error('Invalid voucher signature'))).toMatch(/could not be verified/);
    expect(userFailureReason('Token is inactive')).toBe('This currency is not accepted right now.');
    expect(userFailureReason('AAAAAAAAAGT/////AAAAAQ==')).toBe('The network did not accept this payment.');
    expect(userFailureReason(null)).toBe('The network did not accept this payment.');
  });
});
