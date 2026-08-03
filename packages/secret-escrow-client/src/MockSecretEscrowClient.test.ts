import { bytesToHex } from '@metamask/utils';

import { MockSecretEscrowClient } from './MockSecretEscrowClient.js';
import {
  SecretEscrowError,
  SecretEscrowErrorCode,
} from './errors.js';
import { computeTotpCode, generateTotpSecret } from './totp.js';
import type { WebAuthnEscrowFactor } from './types.js';
import { toPublicEscrowFactor } from './types.js';

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
      proof: {
        type: 'webauthn',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge,
        },
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

  it('registers a password factor and releases S with the correct password', async () => {
    const client = new MockSecretEscrowClient();
    const { secret: enrolledSecret } = await client.register({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });

    expect(client.listFactors('user-1')).toEqual({
      password: { type: 'password' },
    });

    const { challenge } = await client.exportInit({
      userId: 'user-1',
      factorId: 'password',
    });
    const { secret } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'password',
      proof: { type: 'password', password: 'wallet-password' },
    });
    expect(bytesToHex(secret)).toBe(bytesToHex(enrolledSecret));
    // Challenge is issued for anti-replay even for password factors.
    expect(challenge).toBeTruthy();
  });

  it('supports 1-of-N: either password or passkey can release S', async () => {
    const client = new MockSecretEscrowClient();
    const { secret: enrolledSecret } = await client.register({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });
    await client.addFactor({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    expect(Object.keys(client.listFactors('user-1')).sort()).toEqual([
      'passkey',
      'password',
    ]);

    const passwordExport = await client.exportInit({
      userId: 'user-1',
      factorId: 'password',
    });
    const { secret: fromPassword } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'password',
      proof: { type: 'password', password: 'wallet-password' },
    });
    expect(bytesToHex(fromPassword)).toBe(bytesToHex(enrolledSecret));

    const passkeyExport = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    const { secret: fromPasskey } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'passkey',
      proof: {
        type: 'webauthn',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge: passkeyExport.challenge,
        },
      },
    });
    expect(bytesToHex(fromPasskey)).toBe(bytesToHex(enrolledSecret));
    expect(passwordExport.challenge).toBeTruthy();
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

  it('rejects addFactor for an unknown user or duplicate factor id', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.addFactor({
        userId: 'missing',
        factorId: 'passkey',
        factor: TEST_FACTOR,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });

    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    await expect(
      client.addFactor({
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
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge: 'nope',
          },
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
        proof: {
          type: 'webauthn',
          assertion: {
            id: 'wrong-credential',
            challenge,
          },
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

  it('rejects an empty password factor and unknown factor types', async () => {
    const client = new MockSecretEscrowClient();

    await expect(
      client.register({
        userId: 'user-1',
        factorId: 'password',
        factor: {
          type: 'password',
          password: '',
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });

    await expect(
      client.register({
        userId: 'user-2',
        factorId: 'otp',
        factor: {
          type: 'otp',
        } as unknown as WebAuthnEscrowFactor,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.InvalidFactor,
    });
  });

  it('adds a TOTP factor and releases S with a valid code', async () => {
    const client = new MockSecretEscrowClient();
    const { secret } = await client.register({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });

    const totpSecret = generateTotpSecret(() => new Uint8Array(20).fill(3));
    await client.addFactor({
      userId: 'user-1',
      factorId: 'totp',
      factor: { type: 'totp', secret: totpSecret },
    });

    const now = 1_700_000_000;
    const code = await computeTotpCode(totpSecret, now);
    jest.spyOn(Date, 'now').mockReturnValue(now * 1000);

    await client.exportInit({ userId: 'user-1', factorId: 'totp' });
    const { secret: released } = await client.exportComplete({
      userId: 'user-1',
      factorId: 'totp',
      proof: { type: 'totp', code },
    });
    expect(bytesToHex(released)).toBe(bytesToHex(secret));
    released.fill(0);
    secret.fill(0);
    jest.restoreAllMocks();
  });

  it('rejects mismatched proof types and wrong passwords', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });
    await client.addFactor({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    const passwordChallenge = await client.exportInit({
      userId: 'user-1',
      factorId: 'password',
    });
    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'password',
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge: passwordChallenge.challenge,
          },
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });

    const again = await client.exportInit({
      userId: 'user-1',
      factorId: 'password',
    });
    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'password',
        proof: { type: 'password', password: 'wrong' },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });
    expect(again.challenge).toBeTruthy();

    const passkeyChallenge = await client.exportInit({
      userId: 'user-1',
      factorId: 'passkey',
    });
    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        proof: { type: 'password', password: 'wallet-password' },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AssertionFailed,
    });
    expect(passkeyChallenge.challenge).toBeTruthy();
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
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge: 'wrong-challenge',
          },
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
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge: 'anything',
          },
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
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge,
          },
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
    await client.setFactorsForTests('user-1', {});

    await expect(
      client.exportComplete({
        userId: 'user-1',
        factorId: 'passkey',
        proof: {
          type: 'webauthn',
          assertion: {
            id: TEST_FACTOR.credentialId,
            challenge,
          },
        },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.UnknownFactor,
    });
  });

  it('setFactorsForTests can replace factors with a password factor', async () => {
    const client = new MockSecretEscrowClient();
    await client.register({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    await client.setFactorsForTests('user-1', {
      password: { type: 'password', password: 'wallet-password' },
    });

    expect(client.listFactors('user-1')).toEqual({
      password: { type: 'password' },
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

  it('setFactorsForTests throws when the user is missing', async () => {
    const client = new MockSecretEscrowClient();
    await expect(client.setFactorsForTests('missing', {})).rejects.toThrow(
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
      proof: {
        type: 'webauthn',
        assertion: {
          id: TEST_FACTOR.credentialId,
          challenge,
        },
      },
    });
    expect(bytesToHex(released)).toBe(bytesToHex(secret));
  });

  it('lists empty factors for unknown users and strips password plaintext', () => {
    const client = new MockSecretEscrowClient();
    expect(client.listFactors('missing')).toEqual({});
    expect(
      toPublicEscrowFactor({ type: 'password', password: 'secret' }),
    ).toEqual({ type: 'password' });
    expect(toPublicEscrowFactor(TEST_FACTOR)).toEqual(TEST_FACTOR);
  });
});
