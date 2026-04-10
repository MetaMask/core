import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64UrlStringToArrayBuffer,
  bytesToBase64URL,
  decodeBase64UrlString,
} from './encoding';

describe('encoding', () => {
  describe('bytesToBase64URL / decodeBase64UrlString', () => {
    it('round-trips random bytes', () => {
      const input = new Uint8Array([0, 255, 128, 1, 2, 3]);
      const encoded = bytesToBase64URL(input);
      expect(encoded).not.toMatch(/[+/=]/u);
      expect(decodeBase64UrlString(encoded)).toStrictEqual(input);
    });

    it('round-trips empty input', () => {
      const encoded = bytesToBase64URL(new Uint8Array(0));
      expect(decodeBase64UrlString(encoded)).toStrictEqual(new Uint8Array(0));
    });
  });

  describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
    it('round-trips binary data', () => {
      const bytes = new Uint8Array([10, 20, 30, 40, 50]);
      const b64 = arrayBufferToBase64(bytes.buffer);
      const out = new Uint8Array(base64ToArrayBuffer(b64));
      expect(out).toStrictEqual(bytes);
    });
  });

  describe('base64UrlStringToArrayBuffer', () => {
    it('decodes base64url produced by bytesToBase64URL', () => {
      const input = new Uint8Array([0, 255, 1, 2]);
      const wire = bytesToBase64URL(input);
      expect(new Uint8Array(base64UrlStringToArrayBuffer(wire))).toStrictEqual(
        input,
      );
    });
  });
});
