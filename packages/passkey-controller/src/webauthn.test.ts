import { bytesToBase64URL } from './encoding';
import {
  verifyChallengeInClientData,
  webauthnWireBinaryToBytes,
} from './webauthn';

function clientDataToWire(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
): string {
  const json = JSON.stringify({
    type,
    challenge,
    origin: 'https://example.test',
  });
  return bytesToBase64URL(new TextEncoder().encode(json));
}

describe('webauthn', () => {
  describe('webauthnWireBinaryToBytes', () => {
    it('accepts base64url string', () => {
      const wire = bytesToBase64URL(new TextEncoder().encode('hello'));
      expect(new TextDecoder().decode(webauthnWireBinaryToBytes(wire))).toBe(
        'hello',
      );
    });

    it('accepts ArrayBuffer', () => {
      const arrayBuffer = new Uint8Array([1, 2, 3]).buffer;
      expect(webauthnWireBinaryToBytes(arrayBuffer)).toStrictEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    it('accepts Uint8Array view', () => {
      const u8 = new Uint8Array([9, 8, 7]);
      expect(webauthnWireBinaryToBytes(u8)).toStrictEqual(u8);
    });

    it('accepts numeric arrays as byte sequences', () => {
      expect(webauthnWireBinaryToBytes([10, 20, 30])).toStrictEqual(
        new Uint8Array([10, 20, 30]),
      );
    });

    it('throws on unsupported wire shape', () => {
      expect(() => webauthnWireBinaryToBytes(123)).toThrow(TypeError);
    });
  });

  describe('verifyChallengeInClientData', () => {
    it('returns true when type and challenge match', () => {
      const challenge = 'test-challenge-b64url';
      const wire = clientDataToWire('webauthn.create', challenge);
      expect(
        verifyChallengeInClientData(wire, challenge, 'webauthn.create'),
      ).toBe(true);
    });

    it('returns false when challenge differs', () => {
      const wire = clientDataToWire('webauthn.get', 'expected');
      expect(verifyChallengeInClientData(wire, 'other', 'webauthn.get')).toBe(
        false,
      );
    });

    it('returns false when type differs', () => {
      const challenge = 'c';
      const wire = clientDataToWire('webauthn.create', challenge);
      expect(verifyChallengeInClientData(wire, challenge, 'webauthn.get')).toBe(
        false,
      );
    });

    it('returns false on invalid JSON', () => {
      const wire = bytesToBase64URL(new TextEncoder().encode('not-json'));
      expect(verifyChallengeInClientData(wire, 'x', 'webauthn.create')).toBe(
        false,
      );
    });
  });
});
