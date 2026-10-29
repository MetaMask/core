import { bytesToHex, hexToBytes } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  canonicalize,
  decryptFromPublic,
  encryptToPublic,
  generateSigningKey,
  generateWrapKey,
  hash,
  hashMutationReceipt,
  receiptKeyId,
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

  it('canonicalizes Uint8Array values nested in arrays and objects as hex', () => {
    expect(
      canonicalize({ list: [new Uint8Array([1]), { z: new Uint8Array([2]) }] }),
    ).toBe(`{"list":["0x01",{"z":"0x02"}]}`);
  });

  it('drops undefined object values and nulls undefined array items', () => {
    expect(canonicalize({ a: undefined, b: [undefined, 1] })).toBe(
      '{"b":[null,1]}',
    );
  });

  it('hashes independently of key order', async () => {
    expect(await hash({ b: 1, a: 2 })).toBe(await hash({ a: 2, b: 1 }));
  });

  it('hashes bytes the same as their 0x-prefixed hex encoding', async () => {
    const bytes = new Uint8Array([255, 0, 16]);
    expect(await hash({ a: bytes })).toBe(await hash({ a: bytesToHex(bytes) }));
  });

  it('round-trips an Ed25519 proof signature', async () => {
    const key = await generateSigningKey();
    const signature = await sign(key.privateKey, 'hello');

    expect(await verifySignature(key.publicKey, signature, 'hello')).toBe(true);
    expect(await verifySignature(key.publicKey, signature, 'other')).toBe(
      false,
    );
  });

  it('returns false for malformed verification inputs instead of throwing', async () => {
    const key = await generateSigningKey();
    const signature = await sign(key.privateKey, 'hello');

    expect(await verifySignature(key.publicKey, '0x00', 'hello')).toBe(false);
    expect(await verifySignature(key.publicKey, 'not-hex', 'hello')).toBe(
      false,
    );
    expect(
      await verifySignature(key.publicKey, signature.slice(0, -2), 'hello'),
    ).toBe(false);
    expect(await verifySignature(new Uint8Array(31), signature, 'hello')).toBe(
      false,
    );
  });

  it('rejects a signing key of the wrong length', async () => {
    await expect(sign(new Uint8Array(0), 'hello')).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for Ed25519.',
    );
  });

  it('matches the Auth API and escrow identifiers hash', async () => {
    const identifiers: Identifier[] = [
      {
        type: 'social',
        namespace: 'https://accounts.google.com',
        value: 'abc',
      },
      {
        type: 'passkey',
        namespace: 'metamask.io',
        value: 'AQID',
        verifier: {
          credentialId: 'AQID',
          publicKey: { cose: 'AQID' },
          rpId: 'metamask.io',
          origins: ['https://metamask.io', 'android:apk-key-hash:example'],
        },
      },
    ];
    expect(await hash(identifiers)).toBe(
      '0x7fbf077f78e6cc4c420eb9b1885ba911aca3ec9810422ab5f26f767f13622090',
    );
    expect(await hash([...identifiers].reverse())).not.toBe(
      await hash(identifiers),
    );
  });

  describe('wire-format vectors', () => {
    // Computed independently with raw WebCrypto X25519, HKDF-SHA256, AES-GCM,
    // and Ed25519. These guard against changes to the escrow wire format.
    const pubA = hexToBytes(
      '0xa4e09292b651c278b9772c569f5fa9bb13d906b46ab68c9df9dc2b4409f8a209',
    );
    const privB = hexToBytes(
      '0x0202020202020202020202020202020202020202020202020202020202020202',
    );
    const pubB = hexToBytes(
      '0xce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d59',
    );
    const ciphertext = hexToBytes(
      '0x03030303030303030303030359258c0012ebb6bea5d2c386500608204ef8344ae6',
    );
    const receiptPublicKey = hexToBytes(
      '0xca93ac1705187071d67b83c7ff0efe8108e8ec4530575d7726879333dbdabe7c',
    );
    const receiptPrivateKey = hexToBytes(
      '0x0404040404040404040404040404040404040404040404040404040404040404',
    );
    const pinnedMessage =
      '0x665cec53b6bd2aa401cf30969b6b2e67aa897b90432758ca89f6268970ce2d4c';

    it('hashes canonical JSON to the pinned SHA-256 digest', async () => {
      expect(await hash({ c: { d: null }, b: [1, 'x'], a: 1 })).toBe(
        '0x665cec53b6bd2aa401cf30969b6b2e67aa897b90432758ca89f6268970ce2d4c',
      );
    });

    it('derives the pinned wrap key id', async () => {
      expect(await wrapKeyId(pubB)).toBe(
        '0xcfa570c653bd212b10a9cb551fd7a1b4789855ee17e99ef2b3a2037feb337a08',
      );
    });

    it('derives the pinned receipt key id', async () => {
      expect(await receiptKeyId(receiptPublicKey)).toBe(
        '0xc5b940ed3f65c391965de8295fc5d25f474fa57b48d36eb10ad363b8539c1b79',
      );
    });

    it('signs the pinned message with the pinned Ed25519 key', async () => {
      expect(await sign(receiptPrivateKey, pinnedMessage)).toBe(
        '0xeee8a9a363927aa129a5366b56c59fb7b31484765595e176104ab744782a28c4b1a50d547df18f65549dab2228cbb0015bd743265266f3316a0a2b00f9a05609',
      );
    });

    it('verifies the pinned Ed25519 signature', async () => {
      expect(
        await verifySignature(
          receiptPublicKey,
          '0xeee8a9a363927aa129a5366b56c59fb7b31484765595e176104ab744782a28c4b1a50d547df18f65549dab2228cbb0015bd743265266f3316a0a2b00f9a05609',
          pinnedMessage,
        ),
      ).toBe(true);
    });

    it('decrypts the pinned escrow-wrap-v1 ciphertext', async () => {
      expect(await decryptFromPublic(privB, pubA, ciphertext)).toStrictEqual(
        new Uint8Array([1, 2, 3, 4, 5]),
      );
    });
  });

  it('generates 32-byte X25519 wrap and Ed25519 signing key pairs', async () => {
    const wrapKey = await generateWrapKey();
    const signingKey = await generateSigningKey();

    expect(wrapKey.publicKey).toHaveLength(32);
    expect(wrapKey.privateKey).toHaveLength(32);
    expect(signingKey.publicKey).toHaveLength(32);
    expect(signingKey.privateKey).toHaveLength(32);
  });

  it('round-trips wrap encryption to a wrap public key', async () => {
    const wrapKey = await generateWrapKey();
    const ephemeral = await generateWrapKey();
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

    const ciphertext = await encryptToPublic(
      ephemeral.privateKey,
      wrapKey.publicKey,
      plaintext,
    );

    expect(
      await decryptFromPublic(
        wrapKey.privateKey,
        ephemeral.publicKey,
        ciphertext,
      ),
    ).toStrictEqual(plaintext);
  });

  it('round-trips getSecret wrapping with an ephemeral client key', async () => {
    const wrapKey = await generateWrapKey();
    const ephemeral = await generateWrapKey();
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
    const key = await generateSigningKey();
    const unsigned = {
      mutationId: '0x1',
      requestHash: '0x2',
      escrowId: 'cubist',
      version: 1,
      receiptKeyId: await receiptKeyId(key.publicKey),
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

  it('rejects truncated wrap ciphertext', async () => {
    const wrapKey = await generateWrapKey();
    await expect(
      decryptFromPublic(
        wrapKey.privateKey,
        wrapKey.publicKey,
        new Uint8Array([0]),
      ),
    ).rejects.toThrow('Wrapped secret is truncated');
  });

  it('rejects wrap keys of the wrong length', async () => {
    const wrapKey = await generateWrapKey();
    await expect(
      encryptToPublic(
        wrapKey.privateKey,
        new Uint8Array(0),
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 32 bytes for X25519.',
    );
    await expect(
      decryptFromPublic(
        new Uint8Array(0),
        wrapKey.publicKey,
        new Uint8Array(33),
      ),
    ).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for X25519.',
    );
  });

  it('rejects a low-order wrap public key', async () => {
    const ephemeral = await generateWrapKey();

    await expect(
      encryptToPublic(
        ephemeral.privateKey,
        new Uint8Array(32),
        new Uint8Array([1]),
      ),
    ).rejects.toMatchObject({ name: 'OperationError' });
  });
});
