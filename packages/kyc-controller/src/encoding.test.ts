import { areUint8ArraysEqual } from '@metamask/utils';

import { base64UrlToBytes, toBase64Url } from './encoding.js';

describe('encoding', () => {
  describe('toBase64Url', () => {
    it('produces unpadded, url-safe base64', () => {
      // 0xFB 0xFF encodes to "+/8=" in standard base64, exercising both the
      // `+`->`-`, `/`->`_`, and padding-stripping substitutions.
      const encoded = toBase64Url(new Uint8Array([0xfb, 0xff]));

      expect(encoded).toBe('-_8');
      expect(encoded).not.toContain('=');
    });
  });

  describe('base64UrlToBytes', () => {
    it('round-trips arbitrary bytes through toBase64Url', () => {
      const bytes = new Uint8Array([0x00, 0x01, 0xfb, 0xff, 0x10, 0x2a, 0x7f]);

      const roundTripped = base64UrlToBytes(toBase64Url(bytes));

      expect(areUint8ArraysEqual(roundTripped, bytes)).toBe(true);
    });

    it('decodes an already-padded standard base64url string', () => {
      const bytes = new Uint8Array([0xfb, 0xff]);

      expect(areUint8ArraysEqual(base64UrlToBytes('-_8='), bytes)).toBe(true);
    });
  });
});
