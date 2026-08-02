import { bytesToHex } from '@metamask/utils';

import { MockSecretEscrowClient } from './MockSecretEscrowClient.js';
import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from './errors.js';
import type { WebAuthnEscrowFactor } from './types.js';

const TEST_FACTOR: WebAuthnEscrowFactor = {
  type: 'webauthn',
  rpId: 'example.com',
  origins: ['https://example.com'],
  credentialId: 'credential-id-abc',
  publicKey: {
    kty: 'EC',
    crv: 'P-256',
    x: 'x-coordinate',
    y: 'y-coordinate',
  },
  requireUserVerification: true,
};

describe('MockSecretEscrowClient', () => {
  it('registers a generated secret and releases it after a valid export', async () => {
    const client = new MockSecretEscrowClient();

    const { secret: enrolledSecret } = await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    expect(enrolledSecret).toHaveLength(32);

    const { challenge } = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });

    const { secret: releasedSecret } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'passkey',
      assertion: {
        id: TEST_FACTOR.credentialId,
        challenge,
      },
    });

    expect(bytesToHex(releasedSecret)).toBe(bytesToHex(enrolledSecret));
  });

  it('stores a caller-provided secret', async () => {
    const client = new MockSecretEscrowClient();
    const provided = new Uint8Array(32).fill(7);

    const { secret } = await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      secret: provided,
    });

    expect(bytesToHex(secret)).toBe(bytesToHex(provided));
  });

  it('rejects a second registration for the same user', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: TEST_FACTOR,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AlreadyRegistered,
    });
  });

  it('rejects an invalid provided secret length', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: TEST_FACTOR,
        secret: new Uint8Array(16),
      }),
    ).rejects.toBeInstanceOf(SecretEscrowError);
  });

  it('rejects an invalid webauthn factor', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: {
          ...TEST_FACTOR,
          rpId: '',
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  });

  it('rejects exportInit for an unknown user', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.exportInit({ userId: 'missing', factorId: 'passkey' }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('rejects exportInit for an unknown factor', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    await expect(
      client.exportInit({ userId: 'user-1', factorId: 'other' }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.UnknownFactor,
    });
  });

  it('rejects exportComplete without a pending challenge', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge: 'nope',
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NoChallenge,
    });
  });

  it('rejects exportComplete when the assertion does not match', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    const { challenge } = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: 'wrong-credential',
          challenge,
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });
  });

  it('rejects an invalid webauthn public key', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: {
          ...TEST_FACTOR,
          publicKey: {
            kty: 'EC',
            crv: 'P-256',
            x: '',
            y: 'y-coordinate',
          },
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  });

  it('rejects a non-webauthn factor type', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: {
          type: 'password',
        } as unknown as WebAuthnEscrowFactor,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  });

  it('rejects exportComplete when the challenge does not match', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge: 'wrong-challenge',
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });
  });

  it('revokes a user so exportInit fails afterward', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    expect(client.hasUser('user-1')).toBe(true);

    await client.revoke({ userId: 'user-1' });
    expect(client.hasUser('user-1')).toBe(false);

    await expect(
      client.exportInit({ userId: 'user-1', factorId: 'passkey' }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('clears a pending challenge on revoke', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    await client.revoke({ userId: 'user-1' });

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge: 'anything',
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NoChallenge,
    });
  });

  it('rejects exportComplete when the record was removed after exportInit', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    const { challenge } = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    client.deleteRecordForTests('user-1');

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge,
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('rejects exportComplete when the stored factor is missing or invalid', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    const { challenge } = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    client.setFactorsForTests('user-1', {});

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge,
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.UnknownFactor,
    });
  });

  it('rejects empty origins on register', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'passkey',
        factor: {
          ...TEST_FACTOR,
          origins: [],
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  });

  it('setFactorsForTests throws when the user is missing', () => {
    const client = new MockSecretEscrowClient();
    expect(() => client.setFactorsForTests('missing', {})).toThrow(
      'No record for missing',
    );
  });

  it('round-trips an export/import snapshot', async () => {
    const client = new MockSecretEscrowClient();
    const { secret } = await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    const snapshot = client.exportSnapshot();
    const restored = new MockSecretEscrowClient();
    restored.importSnapshot(snapshot);

    const { challenge } = await restored.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    const { secret: released } = await restored.exportComplete({
      userId: 'user-1',
      factorId: 'passkey',
      assertion: {
        id: TEST_FACTOR.credentialId,
        challenge,
      },
    });
    expect(bytesToHex(released)).toBe(bytesToHex(secret));
  });
});
