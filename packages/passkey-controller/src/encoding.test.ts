import { bytesToBase64URL, base64URLToBytes } from './encoding';

describe('encoding', () => {
  describe('bytesToBase64URL / base64URLToBytes', () => {
    it('round-trips random bytes', () => {
      const input = new Uint8Array([0, 255, 128, 1, 2, 3]);
      const encoded = bytesToBase64URL(input);
      expect(encoded).not.toMatch(/[+/=]/u);
      expect(base64URLToBytes(encoded)).toStrictEqual(input);
    });

    it('round-trips empty input', () => {
      const encoded = bytesToBase64URL(new Uint8Array(0));
      expect(base64URLToBytes(encoded)).toStrictEqual(new Uint8Array(0));
    });
  });
});
