import { bigIntToHex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { deriveTestEnvelopeKeys } from '../../tests/mocks/envelopeKeys.js';
import { deriveKeyPair, sealEnvelope } from './envelope-keys.js';
import type { VaultKeySet } from './envelope-keys.js';
import {
  decryptPendingMigration,
  encryptPendingMigration,
} from './pending-migration.js';
import type { PendingEnvelopeMigration } from './pending-migration.js';

const vaultKeySet: VaultKeySet = {
  authKeyPair: deriveKeyPair(new Uint8Array(32).fill(1)),
  encKey: new Uint8Array(32).fill(2),
  localWrapKey: new Uint8Array(32).fill(3),
};

/**
 * @returns A pending migration checkpoint.
 */
async function createPending(): Promise<PendingEnvelopeMigration> {
  const recoveryKeys = deriveTestEnvelopeKeys(new Uint8Array(32).fill(5));
  return {
    v: 2,
    recoverySecret: '0x07',
    passwordAuthPubKey: 'pub',
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

describe('pending envelope migration', () => {
  it('round-trips under the local wrap key', async () => {
    const pending = await createPending();

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
      await createPending(),
      vaultKeySet.localWrapKey,
    );

    expect(
      await decryptPendingMigration(encrypted, new Uint8Array(32).fill(9)),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown version', async () => {
    const encrypted = await encryptPendingMigration(
      { ...(await createPending()), v: 1 as unknown as 2 },
      vaultKeySet.localWrapKey,
    );

    expect(
      await decryptPendingMigration(encrypted, vaultKeySet.localWrapKey),
    ).toBeUndefined();
  });
});
