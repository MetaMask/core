import { bytesToHex } from '@metamask/utils';

import {
  canonicalize,
  canonicalizeIdentifiers,
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

  it('sorts identifiers for ownership hashes', () => {
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

  it('round-trips wrap encryption to a wrap public key', () => {
    const wrapKey = generateSigningKey();
    const ephemeral = generateSigningKey();
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
    const ciphertext = encryptToPublic(
      ephemeral.privateKey,
      wrapKey.publicKey,
      plaintext,
    );

    expect(ciphertext.startsWith('0x')).toBe(false);
    expect(
      decryptFromPublic(wrapKey.privateKey, ephemeral.publicKey, ciphertext),
    ).toStrictEqual(plaintext);
  });

  it('round-trips getSecret wrapping with an ephemeral client key', () => {
    const wrapKey = generateSigningKey();
    const ephemeral = generateSigningKey();
    const plaintext = new Uint8Array([9, 8, 7]);
    const ciphertext = encryptToPublic(
      wrapKey.privateKey,
      ephemeral.publicKey,
      plaintext,
    );

    expect(
      decryptFromPublic(ephemeral.privateKey, wrapKey.publicKey, ciphertext),
    ).toStrictEqual(plaintext);
    expect(wrapKeyId(wrapKey.publicKey)).toMatch(/^0x[0-9a-f]{64}$/u);
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

  it('rejects truncated wrap ciphertext and invalid JWKs', () => {
    const wrapKey = generateSigningKey();
    expect(() =>
      decryptFromPublic(wrapKey.privateKey, wrapKey.publicKey, '00'),
    ).toThrow('Wrapped secret is truncated');
    expect(() => wrapKeyId('{"kty":"OKP"}')).toThrow(
      'Invalid P-256 public JWK',
    );
    expect(() =>
      decryptFromPublic('{}', wrapKey.publicKey, '00'.repeat(32)),
    ).toThrow('Invalid P-256 private JWK');
  });
});
