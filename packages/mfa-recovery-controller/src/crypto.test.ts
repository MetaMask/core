import { bytesToHex } from '@metamask/utils';

import {
  canonicalize,
  canonicalizeIdentifiers,
  compareUtf8,
  decodeHex,
  decryptFromPublic,
  encryptToPublic,
  generateSigningKey,
  hash,
  hashMutationReceipt,
  sign,
  unixNow,
  verifySignature,
  wrapKeyId,
} from './crypto.js';
import type { Identifier } from './types.js';

describe('crypto', () => {
  it('returns unix time in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const now = unixNow();
    const after = Math.floor(Date.now() / 1000);
    expect(Number.isInteger(now)).toBe(true);
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('canonicalizes objects with sorted keys and Uint8Array values', () => {
    expect(canonicalize({ b: 1, a: new Uint8Array([1, 2]) })).toBe(
      `{"a":"${bytesToHex(new Uint8Array([1, 2]))}","b":1}`,
    );
  });

  it('hashes independently of key order', async () => {
    expect(await hash({ b: 1, a: 2 })).toBe(await hash({ a: 2, b: 1 }));
  });

  it('decodes hex with or without a 0x prefix', () => {
    const bytes = new Uint8Array([255, 0, 16]);
    const encoded = bytesToHex(bytes);
    expect(decodeHex(encoded.slice(2))).toStrictEqual(bytes);
    expect(decodeHex(encoded)).toStrictEqual(bytes);
  });

  it('round-trips a P-256 proof signature', async () => {
    const key = generateSigningKey();
    const signature = await sign(key.privateKey, 'hello');

    expect(await verifySignature(key.publicKey, signature, 'hello')).toBe(true);
    expect(await verifySignature(key.publicKey, signature, 'other')).toBe(
      false,
    );
    expect(await verifySignature(key.publicKey, '0x00', 'hello')).toBe(false);
    expect(await verifySignature(key.publicKey, 'not-hex', 'hello')).toBe(
      false,
    );
    expect(await verifySignature('{}', signature, 'hello')).toBe(false);
    await expect(sign('{}', 'hello')).rejects.toThrow(
      'Invalid P-256 private JWK',
    );
  });

  it('sorts identifiers for ownership hashes', async () => {
    const first: Identifier = {
      type: 'passkey',
      namespace: 'b.com',
      value: '2',
      verifier: null,
    };
    const second: Identifier = {
      type: 'passkey',
      namespace: 'a.com',
      value: '1',
      verifier: null,
    };
    expect(canonicalize(canonicalizeIdentifiers([first, second]))).toBe(
      canonicalize(canonicalizeIdentifiers([second, first])),
    );
  });

  describe('identifier sort order', () => {
    // The escrow sorts by UTF-8 byte order (Rust `String` ordering). Any other
    // order changes `identifiersHash` and the escrow rejects the mutation.
    const identifier = (value: string): Identifier => ({
      type: 'passkey',
      namespace: 'metamask.io',
      value,
      verifier: null,
    });
    const sortedValues = (values: string[]): string[] =>
      (
        canonicalizeIdentifiers(values.map(identifier)) as { value: string }[]
      ).map((item) => item.value);

    it('puts uppercase before lowercase, unlike locale order', () => {
      // base64url credential ids are mixed case; localeCompare would put
      // `a2V5LTE` first.
      expect(sortedValues(['a2V5LTE', 'Zm9vLTI'])).toStrictEqual([
        'Zm9vLTI',
        'a2V5LTE',
      ]);
      expect(sortedValues(['Zm9vLTI', 'a2V5LTE'])).toStrictEqual([
        'Zm9vLTI',
        'a2V5LTE',
      ]);
    });

    it('orders by UTF-8 bytes rather than UTF-16 code units', () => {
      // U+FF21 is EF BC A1 in UTF-8 and U+1F600 is F0 9F 98 80, so U+FF21
      // sorts first. In UTF-16 U+1F600 (D83D DE00) would sort first.
      expect(sortedValues(['\u{1F600}', '\uFF21'])).toStrictEqual([
        '\uFF21',
        '\u{1F600}',
      ]);
    });

    it('orders a shorter identifier before its extension', () => {
      expect(sortedValues(['abc', 'ab'])).toStrictEqual(['ab', 'abc']);
    });

    it('compares UTF-8 bytes, treating a shared prefix as shorter', () => {
      expect(compareUtf8('ab', 'abc')).toBeLessThan(0);
      expect(compareUtf8('abc', 'ab')).toBeGreaterThan(0);
      expect(compareUtf8('abc', 'abc')).toBe(0);
      expect(compareUtf8('a', 'b')).toBeLessThan(0);
      expect(compareUtf8('b', 'a')).toBeGreaterThan(0);
    });
  });

  describe('wire-format vectors', () => {
    // Fixed keys and outputs captured from the pre-migration implementation.
    // These guard against changes to the escrow wire format.
    const pubA =
      '{"kty":"EC","crv":"P-256","x":"-GnlZ7gZANe0Gs7QZ4pSpahACCd4QRDreFl7p1o0-fU","y":"Bn-YKRTZNOHs2Fxs-cfnQeslwbGX7FEThxshVEjNTEY"}';
    const pubB =
      '{"kty":"EC","crv":"P-256","x":"5maYv6oliw0cvzGW9YTpxc5lgzzXQWSi19xQPuQPCFE","y":"39L_TUNqvNOOVU-wxFIBhnPSMUlYJE9EAEwGdLNrBGY"}';
    const privB =
      '{"kty":"EC","crv":"P-256","x":"5maYv6oliw0cvzGW9YTpxc5lgzzXQWSi19xQPuQPCFE","y":"39L_TUNqvNOOVU-wxFIBhnPSMUlYJE9EAEwGdLNrBGY","d":"AgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk"}';
    const ciphertext =
      '030303030303030303030303e2b9aa448de9d87c62ef5c18066076f9e5fdd4b575';

    it('hashes canonical JSON to the pinned SHA-256 digest', async () => {
      expect(await hash({ c: { d: null }, b: [1, 'x'], a: 1 })).toBe(
        '0x665cec53b6bd2aa401cf30969b6b2e67aa897b90432758ca89f6268970ce2d4c',
      );
    });

    it('derives the pinned wrap key id', async () => {
      expect(await wrapKeyId(pubB)).toBe(
        '0xaccd2e1ccd3c2c0ebf7daf42ae30c8192dada53086772829e2695504940f67ad',
      );
    });

    it('decrypts the pinned escrow-wrap-v1 ciphertext', async () => {
      expect(await decryptFromPublic(privB, pubA, ciphertext)).toStrictEqual(
        new Uint8Array([1, 2, 3, 4, 5]),
      );
    });
  });

  it('round-trips wrap encryption to a wrap public key', async () => {
    const wrapKey = generateSigningKey();
    const ephemeral = generateSigningKey();
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

    const ciphertext = await encryptToPublic(
      ephemeral.privateKey,
      wrapKey.publicKey,
      plaintext,
    );

    expect(ciphertext.startsWith('0x')).toBe(false);
    expect(
      await decryptFromPublic(
        wrapKey.privateKey,
        ephemeral.publicKey,
        ciphertext,
      ),
    ).toStrictEqual(plaintext);
  });

  it('round-trips getSecret wrapping with an ephemeral client key', async () => {
    const wrapKey = generateSigningKey();
    const ephemeral = generateSigningKey();
    const plaintext = new Uint8Array([9, 8, 7]);
    const ciphertext = await encryptToPublic(
      wrapKey.privateKey,
      ephemeral.publicKey,
      plaintext,
    );

    expect(
      await decryptFromPublic(
        ephemeral.privateKey,
        wrapKey.publicKey,
        ciphertext,
      ),
    ).toStrictEqual(plaintext);
    expect(await wrapKeyId(wrapKey.publicKey)).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('hashes an unsigned mutation receipt independently of key order', async () => {
    const receipt = {
      mutationId: '0x1',
      requestHash: '0x2',
      escrowId: 'cubist',
      version: 1,
      receiptKeyId: '0xabc',
    };

    expect(await hashMutationReceipt(receipt)).toBe(
      await hashMutationReceipt({
        version: 1,
        receiptKeyId: '0xabc',
        requestHash: '0x2',
        mutationId: '0x1',
        escrowId: 'cubist',
      }),
    );
    expect(await hashMutationReceipt(receipt)).toBe(
      await hash({
        escrowId: 'cubist',
        mutationId: '0x1',
        receiptKeyId: '0xabc',
        requestHash: '0x2',
        version: 1,
      }),
    );
  });

  it('verifies a mutation receipt signature', async () => {
    const key = generateSigningKey();
    const unsigned = {
      mutationId: '0x1',
      requestHash: '0x2',
      escrowId: 'cubist',
      version: 1,
      receiptKeyId: await wrapKeyId(key.publicKey),
    };
    const signature = await sign(
      key.privateKey,
      await hashMutationReceipt(unsigned),
    );

    expect(
      await verifySignature(
        key.publicKey,
        signature,
        await hashMutationReceipt(unsigned),
      ),
    ).toBe(true);
    expect(
      await verifySignature(
        key.publicKey,
        signature,
        await hashMutationReceipt({ ...unsigned, version: 2 }),
      ),
    ).toBe(false);
  });

  it('rejects truncated wrap ciphertext and invalid JWKs', async () => {
    const wrapKey = generateSigningKey();
    await expect(
      decryptFromPublic(wrapKey.privateKey, wrapKey.publicKey, '00'),
    ).rejects.toThrow('Wrapped secret is truncated');
    await expect(wrapKeyId('{"kty":"OKP"}')).rejects.toThrow(
      'Invalid P-256 public JWK',
    );
    await expect(
      decryptFromPublic('{}', wrapKey.publicKey, '00'.repeat(32)),
    ).rejects.toThrow('Invalid P-256 private JWK');
  });
});
