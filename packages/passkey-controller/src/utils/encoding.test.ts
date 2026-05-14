import { bytesToBase64URL, base64URLToBytes } from './encoding';

describe('encoding', () => {
  describe('bytesToBase64URL', () => {
    it('encodes an empty array', () => {
      expect(bytesToBase64URL(new Uint8Array([]))).toBe('');
    });

    it('encodes bytes without padding', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      expect(bytesToBase64URL(bytes)).toBe('SGVsbG8');
    });

    it('uses url-safe characters', () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);
      const result = bytesToBase64URL(bytes);
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toContain('=');
    });
  });

  describe('base64URLToBytes', () => {
    it('decodes a base64url string', () => {
      const original = new Uint8Array([72, 101, 108, 108, 111]);
      const encoded = bytesToBase64URL(original);
      const decoded = base64URLToBytes(encoded);
      expect(new Uint8Array(decoded)).toStrictEqual(original);
    });

    it('handles url-safe characters', () => {
      const original = new Uint8Array([0xff, 0xfe, 0xfd]);
      const encoded = bytesToBase64URL(original);
      const decoded = base64URLToBytes(encoded);
      expect(new Uint8Array(decoded)).toStrictEqual(original);
    });

    it('round-trips arbitrary bytes', () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const encoded = bytesToBase64URL(original);
      const decoded = base64URLToBytes(encoded);
      expect(new Uint8Array(decoded)).toStrictEqual(original);
    });
  });
});
