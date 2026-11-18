import {
  bigIntToHex,
  bytesToBase64,
  bytesToHex,
  stringToBytes,
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';

import { deriveTestEnvelopeKeys } from '../../tests/mocks/envelopeKeys.js';
import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import {
  deriveKeyPair,
  derivePubKey,
  getPasswordNamespaceAuthKeyPair,
  nextControlSeq,
  openEnvelope,
  parseControlRecord,
  parseEnvelope,
  pubKeysEqual,
  sealEnvelope,
  selectControlRecord,
  serializeControlRecord,
  serializeEnvelope,
  toControlRecord,
} from './envelope-keys.js';
import type { ControlRecord, VaultKeySet } from './envelope-keys.js';

const CURVE_ORDER = secp256k1.Point.Fn.ORDER;

/**
 * @param fill - The byte to fill the keys with.
 * @returns A deterministic vault key set.
 */
function createVaultKeySet(fill = 1): VaultKeySet {
  return {
    authKeyPair: deriveKeyPair(new Uint8Array(32).fill(fill)),
    encKey: new Uint8Array(32).fill(fill + 1),
    localWrapKey: new Uint8Array(32).fill(fill + 2),
  };
}

/**
 * @param seq - The record sequence number.
 * @param sk - The password namespace auth private key.
 * @returns A control record.
 */
function createRecord(seq: number, sk: bigint): ControlRecord {
  return {
    v: 1,
    seq,
    passwordNamespace: {
      verifier: 'verifier',
      verifierId: 'user',
      authSk: bigIntToHex(sk),
      keyIndex: seq,
    },
    migratedAt: 1,
  };
}

const INVALID_ENVELOPE =
  SeedlessOnboardingControllerErrorMessage.InvalidEnvelope;

describe('envelope keys', () => {
  describe('sealEnvelope / openEnvelope', () => {
    it('round-trips the vault key set', async () => {
      const vaultKeySet = createVaultKeySet();
      const { wrapKey } = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));

      const envelope = await sealEnvelope(wrapKey, 'password', vaultKeySet);

      expect(envelope).toStrictEqual({
        v: 1,
        path: 'password',
        vaultAuthPubKey: bytesToHex(vaultKeySet.authKeyPair.pk),
        ct: expect.any(String),
      });
      expect(await openEnvelope(envelope, wrapKey, 'password')).toStrictEqual(
        vaultKeySet,
      );
    });

    it('rejects an envelope opened on the other path', async () => {
      const { wrapKey } = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));
      const envelope = await sealEnvelope(
        wrapKey,
        'recovery-secret',
        createVaultKeySet(),
      );

      await expect(openEnvelope(envelope, wrapKey, 'password')).rejects.toThrow(
        INVALID_ENVELOPE,
      );
    });

    it('rejects an envelope whose header was changed', async () => {
      const { wrapKey } = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));
      const envelope = await sealEnvelope(
        wrapKey,
        'password',
        createVaultKeySet(),
      );

      await expect(
        openEnvelope(
          {
            ...envelope,
            vaultAuthPubKey: bytesToHex(createVaultKeySet(7).authKeyPair.pk),
          },
          wrapKey,
          'password',
        ),
      ).rejects.toThrow(INVALID_ENVELOPE);
    });

    it('rejects an envelope under another wrap key', async () => {
      const envelope = await sealEnvelope(
        deriveTestEnvelopeKeys(new Uint8Array(32).fill(4)).wrapKey,
        'password',
        createVaultKeySet(),
      );

      await expect(
        openEnvelope(
          envelope,
          deriveTestEnvelopeKeys(new Uint8Array(32).fill(5)).wrapKey,
          'password',
        ),
      ).rejects.toThrow(INVALID_ENVELOPE);
    });

    it('rejects a sealed key set that does not match the header', async () => {
      const { wrapKey } = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));
      const other = createVaultKeySet(7);
      // seal another key set under a header naming the first one
      const forged = await sealEnvelope(wrapKey, 'password', {
        ...other,
        authKeyPair: {
          sk: other.authKeyPair.sk,
          pk: createVaultKeySet().authKeyPair.pk,
        },
      });

      await expect(openEnvelope(forged, wrapKey, 'password')).rejects.toThrow(
        INVALID_ENVELOPE,
      );
    });

    it('rejects a sealed body that is not a key set', async () => {
      const { wrapKey } = deriveTestEnvelopeKeys(new Uint8Array(32).fill(4));
      const envelope = await sealEnvelope(
        wrapKey,
        'password',
        createVaultKeySet(),
      );
      const { encrypt } = await import('@metamask/cryptography/aes-gcm');
      const header = {
        v: 1 as const,
        path: 'password' as const,
        vaultAuthPubKey: envelope.vaultAuthPubKey,
      };
      const { iv, ciphertext } = await encrypt(
        wrapKey as Uint8Array<ArrayBuffer>,
        stringToBytes('{"authSk":1}'),
        { additionalData: stringToBytes(JSON.stringify(header)) },
      );
      const ct = bytesToBase64(new Uint8Array([...iv, ...ciphertext]));

      await expect(
        openEnvelope({ ...header, ct }, wrapKey, 'password'),
      ).rejects.toThrow(INVALID_ENVELOPE);
    });
  });

  describe('serializeEnvelope / parseEnvelope', () => {
    it('round-trips an envelope', async () => {
      const envelope = await sealEnvelope(
        new Uint8Array(32).fill(1),
        'recovery-secret',
        createVaultKeySet(),
      );

      expect(parseEnvelope(serializeEnvelope(envelope))).toStrictEqual(
        envelope,
      );
    });

    it.each([
      ['not JSON', 'nope'],
      [
        'an unknown version',
        '{"v":2,"path":"password","vaultAuthPubKey":"","ct":""}',
      ],
      ['an unknown path', '{"v":1,"path":"x","vaultAuthPubKey":"","ct":""}'],
      [
        'a missing ciphertext',
        '{"v":1,"path":"password","vaultAuthPubKey":""}',
      ],
      ['an array', '[]'],
    ])('rejects %s', (_name, data) => {
      expect(() => parseEnvelope(stringToBytes(data))).toThrow(
        INVALID_ENVELOPE,
      );
    });
  });

  describe('control record', () => {
    it('round-trips a control record', () => {
      const record = createRecord(1, 11n);

      expect(parseControlRecord(serializeControlRecord(record))).toStrictEqual(
        record,
      );
    });

    it('accepts an auth key without the 0x prefix', () => {
      const record = createRecord(1, 11n);
      record.passwordNamespace.authSk = 'b';

      expect(parseControlRecord(serializeControlRecord(record))).toStrictEqual(
        record,
      );
    });

    it('drops unknown fields', () => {
      const record = createRecord(1, 11n);
      const data = JSON.stringify({
        ...record,
        extra: 1,
        passwordNamespace: { ...record.passwordNamespace, extra: 2 },
      });

      expect(parseControlRecord(stringToBytes(data))).toStrictEqual(record);
    });

    it.each([
      ['not JSON', 'nope'],
      ['an array', '[]'],
      ['a malformed record', '{"v":1}'],
      ['a record without namespace', '{"v":1,"seq":1,"migratedAt":1}'],
      ['an unknown version', JSON.stringify({ ...createRecord(1, 11n), v: 2 })],
    ])('rejects %s', (_name, data) => {
      expect(() => parseControlRecord(stringToBytes(data))).toThrow(
        INVALID_ENVELOPE,
      );
    });

    it.each([
      ['seq 0', { seq: 0 }],
      ['a fractional seq', { seq: 1.5 }],
      ['an unsafe seq', { seq: 2 ** 53 }],
      ['a string seq', { seq: '1' }],
      ['a negative migratedAt', { migratedAt: -1 }],
      ['a fractional migratedAt', { migratedAt: 1.5 }],
      ['an unsafe migratedAt', { migratedAt: 2 ** 53 }],
    ])('rejects a record with %s', (_name, overrides) => {
      const data = JSON.stringify({ ...createRecord(1, 11n), ...overrides });

      expect(() => parseControlRecord(stringToBytes(data))).toThrow(
        INVALID_ENVELOPE,
      );
    });

    it.each([
      ['an empty auth key', { authSk: '' }],
      ['a non-hex auth key', { authSk: 'zz' }],
      ['a bare 0x auth key', { authSk: '0x' }],
      ['a zero auth key', { authSk: '0x0' }],
      ['an auth key of the curve order', { authSk: bigIntToHex(CURVE_ORDER) }],
      [
        'an auth key above the curve order',
        { authSk: bigIntToHex(CURVE_ORDER + 1n) },
      ],
      ['a numeric auth key', { authSk: 11 }],
      ['a negative keyIndex', { keyIndex: -1 }],
      ['a fractional keyIndex', { keyIndex: 1.5 }],
      ['an unsafe keyIndex', { keyIndex: 2 ** 53 }],
      ['an empty verifier', { verifier: '' }],
      ['a numeric verifier', { verifier: 1 }],
      ['an empty verifierId', { verifierId: '' }],
      ['a missing verifierId', { verifierId: undefined }],
    ])('rejects a record with %s', (_name, overrides) => {
      const record = createRecord(1, 11n);
      const data = JSON.stringify({
        ...record,
        passwordNamespace: { ...record.passwordNamespace, ...overrides },
      });

      expect(() => parseControlRecord(stringToBytes(data))).toThrow(
        INVALID_ENVELOPE,
      );
    });

    it('drops a leftover enabled field from a stored record', () => {
      const record = createRecord(1, 11n);
      const stored = {
        ...record,
        passwordNamespace: { ...record.passwordNamespace, enabled: true },
      };

      const parsed = parseControlRecord(stringToBytes(JSON.stringify(stored)));

      expect(parsed).toStrictEqual(record);
      expect(parsed.passwordNamespace).not.toHaveProperty('enabled');
    });

    it('checks values with toControlRecord without throwing', () => {
      const record = createRecord(1, 11n);

      expect(toControlRecord({ ...record, extra: 1 })).toStrictEqual(record);
      expect(toControlRecord(null)).toBeUndefined();
      expect(
        toControlRecord({
          ...record,
          passwordNamespace: { ...record.passwordNamespace, authSk: 'zz' },
        }),
      ).toBeUndefined();
    });

    it('selects the record matching the live key, highest seq first', () => {
      const records = [
        createRecord(1, 11n),
        createRecord(3, 11n),
        createRecord(2, 12n),
      ];

      expect(selectControlRecord(records, derivePubKey(11n))?.seq).toBe(3);
      expect(selectControlRecord(records, derivePubKey(12n))?.seq).toBe(2);
      expect(selectControlRecord(records, derivePubKey(13n))).toBeUndefined();
    });

    it('numbers the next record after the highest seq', () => {
      expect(nextControlSeq([])).toBe(1);
      expect(nextControlSeq([createRecord(4, 11n), createRecord(2, 12n)])).toBe(
        5,
      );
    });

    it('throws when the next seq is not a safe integer', () => {
      expect(() =>
        nextControlSeq([createRecord(Number.MAX_SAFE_INTEGER, 11n)]),
      ).toThrow(INVALID_ENVELOPE);
    });

    it('rebuilds the password namespace auth key pair', () => {
      const { sk, pk } = getPasswordNamespaceAuthKeyPair(createRecord(1, 11n));

      expect(sk).toBe(11n);
      expect(pubKeysEqual(pk, derivePubKey(11n))).toBe(true);
    });
  });

  it('compares compressed and uncompressed public keys', () => {
    const { sk } = deriveKeyPair(new Uint8Array(32).fill(2));

    expect(
      pubKeysEqual(secp256k1.getPublicKey(sk, true), derivePubKey(sk)),
    ).toBe(true);
  });
});
