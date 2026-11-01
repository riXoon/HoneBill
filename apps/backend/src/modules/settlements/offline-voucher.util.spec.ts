import { describe, expect, it } from '@jest/globals';
import {
  buildOfflineSignatureXdr,
  parseOfflineVoucher,
  verifyOfflineVoucherSignature,
} from './offline-voucher.util.js';

const nonceB64 = Buffer.alloc(32, 0xaa).toString('base64');
const signatureB64 = Buffer.alloc(64, 0xbb).toString('base64');
const voucher = `1:aB3x9Q:Zx7mNk:3v5K:${nonceB64}:${signatureB64}`;

describe('offline voucher parser and signature helpers', () => {
  it('parses the legacy six-part voucher format', () => {
    const parsed = parseOfflineVoucher(voucher);
    expect(parsed).toMatchObject({
      tokenId: 1,
      tokenIdStr: '1',
      senderShortId: 'aB3x9Q',
      receiverShortId: 'Zx7mNk',
      amountBase62: '3v5K',
    });
    expect(parsed.nonce).toHaveLength(32);
    expect(parsed.amountStroops).toBeGreaterThan(0n);
    expect(parsed.signature).toHaveLength(64);
  });

  it('accepts unpadded URL-safe Base64 and rejects malformed part counts', () => {
    const urlSafeNonce = nonceB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const urlSafeSignature = signatureB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:3v5K:${urlSafeNonce}:${urlSafeSignature}`).nonce).toHaveLength(32);
    expect(() => parseOfflineVoucher('1:2:3')).toThrow('expected 6 parts, got 3');
    expect(() => parseOfflineVoucher('')).toThrow('expected 6 parts');
    expect(() => parseOfflineVoucher(`${voucher}:extra`)).toThrow('expected 6 parts, got 7');
  });

  it('rejects invalid token IDs and short IDs', () => {
    for (const tokenId of ['abc', '0', '-1', '9007199254740992']) {
      expect(() => parseOfflineVoucher(`${tokenId}:aB3x9Q:Zx7mNk:3v5K:${nonceB64}:${signatureB64}`)).toThrow('Invalid token ID');
    }
    for (const shortId of ['short', 'tooLong1', 'aB-3x9', 'aB3x_9']) {
      expect(() => parseOfflineVoucher(`1:${shortId}:Zx7mNk:3v5K:${nonceB64}:${signatureB64}`)).toThrow('senderShortId');
    }
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx_mNk:3v5K:${nonceB64}:${signatureB64}`)).toThrow('receiverShortId');
  });

  it('rejects nonpositive and out-of-range amounts', () => {
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:0:${nonceB64}:${signatureB64}`)).toThrow('Amount must be greater than zero');
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:ZZZZZZZZZZZZZZZZZZZZZZ:${nonceB64}:${signatureB64}`)).toThrow('exceeds i128::MAX');
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:!:${nonceB64}:${signatureB64}`)).toThrow('Invalid Base62');
  });

  it('rejects malformed Base64 and decoded nonce/signature lengths', () => {
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:3v5K:!!!:${signatureB64}`)).toThrow('Nonce contains invalid Base64');
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:3v5K:${nonceB64}:!!!`)).toThrow('Signature contains invalid Base64');
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:3v5K:${Buffer.alloc(16).toString('base64')}:${signatureB64}`)).toThrow('Nonce must decode to 32 bytes');
    expect(() => parseOfflineVoucher(`1:aB3x9Q:Zx7mNk:3v5K:${nonceB64}:${Buffer.alloc(32).toString('base64')}`)).toThrow('Signature must decode to 64 bytes');
  });

  it('matches the legacy XDR golden vector and verifies Ed25519 signatures', () => {
    const xdr = buildOfflineSignatureXdr({
      amountStroops: 100_000_000n,
      tollStroops: 5_000_000n,
      nonce: Buffer.alloc(32, 0x2a),
      receiverShortId: 'aB3x9Q',
      gatewayPublicKey: 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U',
      tokenContractId: 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3',
      contractAddress: 'CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW',
    });
    expect(xdr.toString('hex')).toBe('0000001000000001000000070000000a00000000000000000000000005f5e1000000000a000000000000000000000000004c4b400000000d000000202a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a0000000d0000000661423378395100000000001200000000000000008139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b3940000001200000001030303030303030303030303030303030303030303030303030303030303030300000012000000010404040404040404040404040404040404040404040404040404040404040404');
    expect(verifyOfflineVoucherSignature(
      'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR',
      xdr,
      Buffer.from('a2f6e1452c92032e858eb4c4bb293cc5eecd8ba622ae5283004559723c842f9d73b3f4ce9e937171201cd22cb9992939d80d7f172a11803df9cccd0dae88a700', 'hex'),
    )).toBe(true);
  });

  it('keeps the six-element signature tuple when contract address is omitted', () => {
    const xdr = buildOfflineSignatureXdr({
      amountStroops: 100_000_000n,
      tollStroops: 5_000_000n,
      nonce: Buffer.alloc(32, 1),
      receiverShortId: 'aB3x9Q',
      gatewayPublicKey: 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U',
      tokenContractId: 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3',
    });
    expect(xdr.subarray(0, 12).toString('hex')).toBe('000000100000000100000006');
  });

  it('rejects the golden signature when its contract domain is changed', () => {
    const tampered = buildOfflineSignatureXdr({
      amountStroops: 100_000_000n, tollStroops: 5_000_000n, nonce: Buffer.alloc(32, 0x2a), receiverShortId: 'aB3x9Q',
      gatewayPublicKey: 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U',
      tokenContractId: 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3',
      contractAddress: 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3',
    });
    expect(verifyOfflineVoucherSignature('GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR', tampered,
      Buffer.from('a2f6e1452c92032e858eb4c4bb293cc5eecd8ba622ae5283004559723c842f9d73b3f4ce9e937171201cd22cb9992939d80d7f172a11803df9cccd0dae88a700', 'hex'))).toBe(false);
  });
});
