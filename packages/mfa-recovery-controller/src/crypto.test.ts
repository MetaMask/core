import { bytesToHex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  canonicalize,
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
