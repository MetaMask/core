import { encrypt } from '@metamask/cryptography/aes-gcm';
import {
  bigIntToHex,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  stringToBytes,
} from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { deriveTestEnvelopeKeys } from '../../tests/mocks/envelopeKeys.js';
import { deriveKeyPair, sealEnvelope } from './envelope-keys.js';
import type { VaultKeySet } from './envelope-keys.js';
import {
  decryptPendingMigration,
  encryptPendingMigration,
} from './pending-migration.js';
import type { PendingEnvelopeMigration } from './pending-migration.js';

const PENDING_MIGRATION_AAD = 'mm-envelope-v1/pending-migration';

const vaultKeySet: VaultKeySet = {
  authKeyPair: deriveKeyPair(new Uint8Array(32).fill(1)),
  encKey: new Uint8Array(32).fill(2),
  localWrapKey: new Uint8Array(32).fill(3),
};

type SealedPending = Extract<
  PendingEnvelopeMigration,
  { phase: 'ENVELOPES_SEALED' }
>;

/**
 * @returns A pending migration checkpoint in the ENVELOPES_SEALED phase.
 */
async function createSealedPending(): Promise<SealedPending> {
  const recoveryKeys = deriveTestEnvelopeKeys(new Uint8Array(32).fill(5));
  return {
    v: 1,
    phase: 'ENVELOPES_SEALED',
    id: 'migration-id',
    recoverySecret: '0x07',
    rsAuthPubKey: 'rs-pub',
    vaultAuthPubKey: 'vault-pub',
    recoveryEnvelope: {
      keys: recoveryKeys,
      envelope: await sealEnvelope(
        recoveryKeys.wrapKey,
        'recovery-secret',
        vaultKeySet,
      ),
    },
    control: {
      v: 1,
      seq: 1,
      passwordNamespace: {
        verifier: 'verifier',
        verifierId: 'user',
        authSk: bigIntToHex(vaultKeySet.authKeyPair.sk),
        keyIndex: 1,
        enabled: true,
      },
      migratedAt: 1,
    },
  };
}

/**
 * @returns The JSON body of a ENVELOPES_SEALED checkpoint, as stored.
 */
async function createSealedBody(): Promise<Record<string, unknown>> {
  const { recoveryEnvelope, ...rest } = await createSealedPending();
  return {
    ...rest,
    recoveryEnvelope: {
      envAuthSk: bigIntToHex(recoveryEnvelope.keys.authKeyPair.sk),
      wrapKey: bytesToBase64(recoveryEnvelope.keys.wrapKey),
      envelope: recoveryEnvelope.envelope,
    },
  };
}

/**
 * Encrypt raw bytes the way a checkpoint is stored, with a chosen label.
 *
 * @param plaintext - The plaintext bytes.
 * @param additionalData - The associated data label.
 * @returns base64(iv || ciphertext).
 */
async function encryptBytes(
  plaintext: Uint8Array,
  additionalData = PENDING_MIGRATION_AAD,
): Promise<string> {
  const { iv, ciphertext } = await encrypt(
    vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
    plaintext as Uint8Array<ArrayBuffer>,
    { additionalData: stringToBytes(additionalData) },
  );
  return bytesToBase64(concatBytes([iv, ciphertext]));
}

/**
 * @param body - The JSON body to encrypt.
 * @returns base64(iv || ciphertext) of the body.
 */
async function encryptBody(body: unknown): Promise<string> {
  return encryptBytes(stringToBytes(JSON.stringify(body)));
}

describe('pending envelope migration', () => {
  it('round-trips the RS_TOPRF_REGISTERED phase', async () => {
    const pending: PendingEnvelopeMigration = {
      v: 1,
      phase: 'RS_TOPRF_REGISTERED',
      id: 'migration-id',
      recoverySecret: '0x07',
      rsAuthPubKey: 'rs-pub',
    };

    const encrypted = await encryptPendingMigration(
      pending,
      vaultKeySet.localWrapKey,
    );

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toStrictEqual(pending);
  });

  it('round-trips the ENVELOPES_SEALED phase with its sealed envelope', async () => {
    const pending = await createSealedPending();

    const encrypted = await encryptPendingMigration(
      pending,
      vaultKeySet.localWrapKey,
    );
    const decrypted = await decryptPendingMigration(
      encrypted,
      vaultKeySet.localWrapKey,
    );

    expect(decrypted).toStrictEqual(pending);
    const sealed = (decrypted as SealedPending).recoveryEnvelope.keys;
    expect(sealed.authKeyPair.sk).toBe(
      pending.recoveryEnvelope.keys.authKeyPair.sk,
    );
    expect(bytesToHex(sealed.authKeyPair.pk)).toBe(
      bytesToHex(pending.recoveryEnvelope.keys.authKeyPair.pk),
    );
    expect(bytesToHex(sealed.wrapKey)).toBe(
      bytesToHex(pending.recoveryEnvelope.keys.wrapKey),
    );
  });

  it('round-trips the ENVELOPES_WRITTEN phase', async () => {
    const pending: PendingEnvelopeMigration = {
      v: 1,
      phase: 'ENVELOPES_WRITTEN',
      id: 'migration-id',
      vaultAuthPubKey: 'vault-pub',
    };

    const encrypted = await encryptPendingMigration(
      pending,
      vaultKeySet.localWrapKey,
    );

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toStrictEqual(pending);
  });

  it('returns undefined under another key', async () => {
    const encrypted = await encryptPendingMigration(
      await createSealedPending(),
      vaultKeySet.localWrapKey,
    );

    expect(
      await decryptPendingMigration(encrypted, new Uint8Array(32).fill(9)),
    ).toBeUndefined();
  });

  it('returns undefined when encrypted with another associated data label', async () => {
    const encrypted = await encryptBytes(
      stringToBytes(JSON.stringify(await createSealedBody())),
      'mm-envelope-v1/other',
    );

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown version', async () => {
    const encrypted = await encryptBody({
      ...(await createSealedBody()),
      v: 2,
    });

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined for a body that is not an object', async () => {
    expect(
      await decryptPendingMigration(
        await encryptBody(['not', 'an', 'object']),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
    expect(
      await decryptPendingMigration(
        await encryptBody(null),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the id is missing', async () => {
    const { id: _id, ...body } = await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody(body),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown phase', async () => {
    const encrypted = await encryptBody({
      ...(await createSealedBody()),
      phase: 'UNKNOWN',
    });

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined when the RS_TOPRF_REGISTERED phase lacks rsAuthPubKey', async () => {
    const encrypted = await encryptBody({
      v: 1,
      phase: 'RS_TOPRF_REGISTERED',
      id: 'migration-id',
      recoverySecret: '0x07',
    });

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined when the ENVELOPES_SEALED phase lacks vaultAuthPubKey', async () => {
    const { vaultAuthPubKey: _vaultAuthPubKey, ...body } =
      await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody(body),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the ENVELOPES_SEALED phase lacks rsAuthPubKey', async () => {
    const { rsAuthPubKey: _rsAuthPubKey, ...body } = await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody(body),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the ENVELOPES_SEALED phase lacks recoveryEnvelope', async () => {
    const { recoveryEnvelope: _recoveryEnvelope, ...body } =
      await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody(body),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the recoveryEnvelope lacks its envelope', async () => {
    const body = await createSealedBody();
    const { envelope: _envelope, ...recoveryEnvelope } =
      body.recoveryEnvelope as Record<string, unknown>;

    expect(
      await decryptPendingMigration(
        await encryptBody({ ...body, recoveryEnvelope }),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the recoveryEnvelope secret key is malformed', async () => {
    const body = await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody({
          ...body,
          recoveryEnvelope: {
            ...(body.recoveryEnvelope as Record<string, unknown>),
            envAuthSk: 'not-hex',
          },
        }),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the ENVELOPES_SEALED phase lacks control', async () => {
    const { control: _control, ...body } = await createSealedBody();

    expect(
      await decryptPendingMigration(
        await encryptBody(body),
        vaultKeySet.localWrapKey,
      ),
    ).toBeUndefined();
  });

  it.each([
    ['a control record that is not an object', (): unknown => 'control'],
    [
      'a control record with a bad auth key',
      (control: SealedPending['control']): unknown => ({
        ...control,
        passwordNamespace: { ...control.passwordNamespace, authSk: 'zz' },
      }),
    ],
    [
      'a control record with seq 0',
      (control: SealedPending['control']): unknown => ({ ...control, seq: 0 }),
    ],
  ])(
    'returns undefined when the ENVELOPES_SEALED phase has %s',
    async (_name, createControl) => {
      const body = await createSealedBody();

      expect(
        await decryptPendingMigration(
          await encryptBody({
            ...body,
            control: createControl(body.control as SealedPending['control']),
          }),
          vaultKeySet.localWrapKey,
        ),
      ).toBeUndefined();
    },
  );

  it('drops unknown fields of the ENVELOPES_SEALED control record', async () => {
    const body = await createSealedBody();
    const control = body.control as SealedPending['control'];

    const decrypted = await decryptPendingMigration(
      await encryptBody({
        ...body,
        control: {
          ...control,
          extra: 1,
          passwordNamespace: { ...control.passwordNamespace, extra: 2 },
        },
      }),
      vaultKeySet.localWrapKey,
    );

    expect((decrypted as SealedPending).control).toStrictEqual(control);
  });

  it('returns undefined when the ENVELOPES_WRITTEN phase lacks vaultAuthPubKey', async () => {
    const encrypted = await encryptBody({
      v: 1,
      phase: 'ENVELOPES_WRITTEN',
      id: 'migration-id',
    });

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined for invalid JSON', async () => {
    const encrypted = await encryptBytes(stringToBytes('{not json'));

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });

  it('returns undefined for garbage input', async () => {
    expect(
      await decryptPendingMigration('!!not base64!!', vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });
});
