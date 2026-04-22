import { encodeCBOR } from '@levischuck/tiny-cbor';
import { base64ToBytes, bytesToBase64 } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';

import { bytesToBase64URL } from '../utils/encoding';
import { parseAuthenticatorData } from './parse-authenticator-data';

/**
 * Conformance vectors from SimpleWebAuthn `parseAuthenticatorData.test.ts`
 * (base64-decoded the same way: `isoBase64URL.toBuffer(..., 'base64')`).
 *
 * The Firefox 117 malformed COSE case from upstream is omitted here: that
 * parser patches bad CBOR and re-encodes the public key; this implementation
 * does not, and throws "Leftover bytes detected..." on that buffer.
 */

// Includes attested credential data (AT)
const authDataWithAT = Uint8Array.from(
  base64ToBytes(
    'SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2NBAAAAJch83ZdWwUm4niTLNjZU81AAIHa7Ksm5br3hAh3UjxP9+4rqu8BEsD+7SZ2xWe1/yHv6pAEDAzkBACBZAQDcxA7Ehs9goWB2Hbl6e9v+aUub9rvy2M7Hkvf+iCzMGE63e3sCEW5Ru33KNy4um46s9jalcBHtZgtEnyeRoQvszis+ws5o4Da0vQfuzlpBmjWT1dV6LuP+vs9wrfObW4jlA5bKEIhv63+jAxOtdXGVzo75PxBlqxrmrr5IR9n8Fw7clwRsDkjgRHaNcQVbwq/qdNwU5H3hZKu9szTwBS5NGRq01EaDF2014YSTFjwtAmZ3PU1tcO/QD2U2zg6eB5grfWDeAJtRE8cbndDWc8aLL0aeC37Q36+TVsGe6AhBgHEw6eO3I3NW5r9v/26CqMPBDwmEundeq1iGyKfMloobIUMBAAE=',
  ),
);

// Includes extension data (ED)
const authDataWithED = Uint8Array.from(
  base64ToBytes(
    'SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2OBAAAAjaFxZXhhbXBsZS5leHRlbnNpb254dlRoaXMgaXMgYW4gZXhhbXBsZSBleHRlbnNpb24hIElmIHlvdSByZWFkIHRoaXMgbWVzc2FnZSwgeW91IHByb2JhYmx5IHN1Y2Nlc3NmdWxseSBwYXNzaW5nIGNvbmZvcm1hbmNlIHRlc3RzLiBHb29kIGpvYiE=',
  ),
);

const TEST_RP_ID = 'example.com';

describe('parseAuthenticatorData', () => {
  it('parses flags', () => {
    const parsed = parseAuthenticatorData(authDataWithED);
    const { flags } = parsed;

    expect(flags.up).toBe(true);
    expect(flags.uv).toBe(false);
    expect(flags.be).toBe(false);
    expect(flags.bs).toBe(false);
    expect(flags.at).toBe(false);
    expect(flags.ed).toBe(true);
  });

  it('parses attestation data', () => {
    const parsed = parseAuthenticatorData(authDataWithAT);
    const { credentialID, credentialPublicKey, aaguid, counter } = parsed;

    if (
      credentialID === undefined ||
      credentialPublicKey === undefined ||
      aaguid === undefined
    ) {
      throw new Error('expected credentialID, credentialPublicKey, and aaguid');
    }

    expect(bytesToBase64URL(credentialID)).toBe(
      'drsqybluveECHdSPE_37iuq7wESwP7tJnbFZ7X_Ie_o',
    );
    expect(bytesToBase64(credentialPublicKey)).toBe(
      'pAEDAzkBACBZAQDcxA7Ehs9goWB2Hbl6e9v+aUub9rvy2M7Hkvf+iCzMGE63e3sCEW5Ru33KNy4um46s9jalcBHtZgtEnyeRoQvszis+ws5o4Da0vQfuzlpBmjWT1dV6LuP+vs9wrfObW4jlA5bKEIhv63+jAxOtdXGVzo75PxBlqxrmrr5IR9n8Fw7clwRsDkjgRHaNcQVbwq/qdNwU5H3hZKu9szTwBS5NGRq01EaDF2014YSTFjwtAmZ3PU1tcO/QD2U2zg6eB5grfWDeAJtRE8cbndDWc8aLL0aeC37Q36+TVsGe6AhBgHEw6eO3I3NW5r9v/26CqMPBDwmEundeq1iGyKfMloobIUMBAAE=',
    );
    expect(bytesToBase64(aaguid)).toBe('yHzdl1bBSbieJMs2NlTzUA==');
    expect(counter).toBe(37);
  });

  it('parses extension data', () => {
    const parsed = parseAuthenticatorData(authDataWithED);
    const { extensionsData } = parsed;

    expect(extensionsData).toStrictEqual(
      new Map([
        [
          'example.extension',
          'This is an example extension! If you read this message, you probably successfully passing conformance tests. Good job!',
        ],
      ]),
    );
  });
});

describe('parseAuthenticatorData edge cases', () => {
  it('throws for authenticator data shorter than 37 bytes', () => {
    expect(() => parseAuthenticatorData(new Uint8Array(36))).toThrow(
      'authenticatorData is 36 bytes, expected at least 37',
    );
  });

  it('parses extension data when ED flag is set', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const flags = 0x81;
    const counter = new Uint8Array(4);

    const extMap = new Map();
    extMap.set('credProtect', 2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extCBOR = encodeCBOR(extMap as any);

    const authData = new Uint8Array(37 + extCBOR.length);
    authData.set(rpIdHash, 0);
    authData[32] = flags;
    authData.set(counter, 33);
    authData.set(extCBOR, 37);

    const result = parseAuthenticatorData(authData);
    expect(result.flags.ed).toBe(true);
    expect(result.extensionsData).toBeDefined();
    expect(result.extensionsData?.get('credProtect')).toBe(2);
  });

  it('throws on leftover bytes after parsing', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = new Uint8Array(42);
    authData.set(rpIdHash, 0);
    authData[32] = 0x01;
    authData.set(new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]), 37);

    expect(() => parseAuthenticatorData(authData)).toThrow(
      'Leftover bytes detected while parsing authenticator data',
    );
  });

  it('parses authenticator data without attested credential or extensions', () => {
    const rpIdHash = sha256(new TextEncoder().encode(TEST_RP_ID));
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x05;

    const counterView = new DataView(authData.buffer, 33, 4);
    counterView.setUint32(0, 42, false);

    const result = parseAuthenticatorData(authData);
    expect(result.flags.up).toBe(true);
    expect(result.flags.uv).toBe(true);
    expect(result.flags.at).toBe(false);
    expect(result.flags.ed).toBe(false);
    expect(result.counter).toBe(42);
    expect(result.aaguid).toBeUndefined();
    expect(result.credentialID).toBeUndefined();
    expect(result.credentialPublicKey).toBeUndefined();
    expect(result.extensionsData).toBeUndefined();
  });
});
