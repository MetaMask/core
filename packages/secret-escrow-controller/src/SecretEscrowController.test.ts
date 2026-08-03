import { Messenger } from '@metamask/messenger';
import {
  MockSecretEscrowClient,
  SecretEscrowErrorCode,
} from '@metamask/secret-escrow-client';
import type { WebAuthnEscrowFactor } from '@metamask/secret-escrow-client';
import { bytesToHex } from '@metamask/utils';

import {
  SecretEscrowController,
  getDefaultSecretEscrowControllerState,
  secretEscrowControllerSelectors,
} from './SecretEscrowController.js';
import type {
  SecretEscrowControllerActions,
  SecretEscrowControllerEvents,
  SecretEscrowControllerMessenger,
} from './SecretEscrowController.js';

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
};

function createMessenger(): SecretEscrowControllerMessenger {
  const root = new Messenger<
    'Root',
    SecretEscrowControllerActions,
    SecretEscrowControllerEvents
  >({ namespace: 'Root' });
  return new Messenger<
    'SecretEscrowController',
    SecretEscrowControllerActions,
    SecretEscrowControllerEvents,
    typeof root
  >({
    namespace: 'SecretEscrowController',
    parent: root,
  });
}

describe('SecretEscrowController', () => {
  it('returns empty factors when not enrolled', () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    expect(controller.listFactors()).toEqual({});
    expect(
      secretEscrowControllerSelectors.selectFactors(controller.state),
    ).toEqual({});
  });

  it('hydrates with a fallback factor id and factors map', async () => {
    const client = Object.assign(new MockSecretEscrowClient(), {
      putEnrollmentMetadata: jest.fn(),
      getEnrollmentMetadata: jest.fn().mockResolvedValue({
        userId: 'user-1',
        factorId: '',
        factor: TEST_FACTOR,
        wrappedPassword: { ciphertext: 'c', iv: 'i' },
        enrolledAt: 42,
      }),
    });
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    expect(await controller.hydrateFromRemote('user-1')).toBe(true);
    expect(controller.state.escrowRecord).toMatchObject({
      factorId: 'passkey',
      factors: { passkey: TEST_FACTOR },
      wrappedPassword: { ciphertext: 'c', iv: 'i' },
    });
  });

  it('enrolls, exports, and revokes via the escrow client', async () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    expect(controller.isEnrolled()).toBe(false);
    expect(
      secretEscrowControllerSelectors.selectIsEnrolled(controller.state),
    ).toBe(false);

    const secret = await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    expect(secret).toHaveLength(32);
    expect(controller.isEnrolled()).toBe(true);
    expect(
      secretEscrowControllerSelectors.selectEscrowRecord(controller.state)
        ?.factor.credentialId,
    ).toBe(TEST_FACTOR.credentialId);
    expect(controller.state.mockClientSnapshot).not.toBeNull();

    const { challenge } = await controller.startExport();
    const released = await controller.completeExport({
      id: TEST_FACTOR.credentialId,
      challenge,
    });
    expect(bytesToHex(released)).toBe(bytesToHex(secret));

    await controller.revoke();
    expect(controller.isEnrolled()).toBe(false);
    expect(client.hasUser('user-1')).toBe(false);
    expect(controller.state.mockClientSnapshot).toBeNull();
  });

  it('wraps and recovers a wallet password', async () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    await controller.enrollAndWrapPassword({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      password: 'wallet-password',
    });

    expect(
      secretEscrowControllerSelectors.selectHasWrappedPassword(controller.state),
    ).toBe(true);

    const { challenge } = await controller.startExport();
    const password = await controller.recoverPassword({
      id: TEST_FACTOR.credentialId,
      challenge,
    });
    expect(password).toBe('wallet-password');
  });

  it('restores mock backend state from a persisted snapshot', async () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });
    await controller.enrollAndWrapPassword({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      password: 'wallet-password',
    });

    const restoredClient = new MockSecretEscrowClient();
    const restored = new SecretEscrowController({
      messenger: createMessenger(),
      client: restoredClient,
      state: controller.state,
    });

    const { challenge } = await restored.startExport();
    await expect(
      restored.recoverPassword({
        id: TEST_FACTOR.credentialId,
        challenge,
      }),
    ).resolves.toBe('wallet-password');
  });

  it('rejects recoverPassword when no wrapped password exists', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    const { challenge } = await controller.startExport();

    await expect(
      controller.recoverPassword({
        id: TEST_FACTOR.credentialId,
        challenge,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('rejects a second enroll while already enrolled', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    await expect(
      controller.enroll({
        userId: 'user-2',
        factorId: 'passkey',
        factor: TEST_FACTOR,
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AlreadyRegistered,
    });
  });

  it('rejects startExport when not enrolled', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });

    await expect(controller.startExport()).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('rejects completeExport when not enrolled', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });

    await expect(
      controller.completeExport({
        id: TEST_FACTOR.credentialId,
        challenge: 'x',
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.NotRegistered,
    });
  });

  it('clearState removes local enrollment without requiring remote revoke', async () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });
    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    controller.clearState();
    expect(controller.isEnrolled()).toBe(false);
    expect(client.hasUser('user-1')).toBe(true);
  });

  it('revoke is a no-op against the client when not enrolled', async () => {
    const client = new MockSecretEscrowClient();
    const revokeSpy = jest.spyOn(client, 'revoke');
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    await controller.revoke();
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(controller.isEnrolled()).toBe(false);
  });

  it('skips mock snapshot persistence for non-snapshot clients', async () => {
    const client = {
      register: jest.fn().mockResolvedValue({ secret: new Uint8Array(32) }),
      addFactor: jest.fn(),
      exportInit: jest.fn(),
      exportComplete: jest.fn(),
      revoke: jest.fn(),
    };
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    expect(controller.state.mockClientSnapshot).toBeNull();
  });

  it('treats a client missing importSnapshot as non-snapshot-capable', async () => {
    const client = {
      register: jest.fn().mockResolvedValue({ secret: new Uint8Array(32) }),
      addFactor: jest.fn(),
      exportInit: jest.fn(),
      exportComplete: jest.fn(),
      revoke: jest.fn(),
      exportSnapshot: jest.fn(),
    };
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    expect(client.exportSnapshot).not.toHaveBeenCalled();
    expect(controller.state.mockClientSnapshot).toBeNull();
  });

  it('hydrates local enrollment from a remote enrollment-capable client', async () => {
    const metadataStore = new Map<
      string,
      {
        userId: string;
        factorId: string;
        factor: WebAuthnEscrowFactor;
        wrappedPassword: { ciphertext: string; iv: string };
        enrolledAt: number;
      }
    >();
    const base = new MockSecretEscrowClient();
    const client = Object.assign(base, {
      putEnrollmentMetadata: jest.fn(async (metadata) => {
        metadataStore.set(metadata.userId, metadata);
      }),
      getEnrollmentMetadata: jest.fn(async (userId: string) => {
        return metadataStore.get(userId) ?? null;
      }),
    });

    const enrolled = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });
    await enrolled.enrollAndWrapPassword({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
      password: 'wallet-password',
    });
    expect(client.putEnrollmentMetadata).toHaveBeenCalled();

    // Simulate wipe: new controller, empty local state, same remote client store.
    const hydrated = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });
    expect(await hydrated.hydrateFromRemote('user-1')).toBe(true);
    expect(hydrated.isEnrolled()).toBe(true);

    const { challenge } = await hydrated.startExport();
    await expect(
      hydrated.recoverPassword({
        id: TEST_FACTOR.credentialId,
        challenge,
      }),
    ).resolves.toBe('wallet-password');
  });

  it('hydrateFromRemote is a no-op without enrollment-capable client', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    expect(await controller.hydrateFromRemote('user-1')).toBe(false);
  });

  it('hydrateFromRemote is a no-op when already enrolled or remote has no wrap', async () => {
    const client = Object.assign(new MockSecretEscrowClient(), {
      putEnrollmentMetadata: jest.fn(),
      getEnrollmentMetadata: jest.fn().mockResolvedValue(null),
    });
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });
    await controller.enroll({
      userId: 'user-1',
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    expect(await controller.hydrateFromRemote('user-1')).toBe(false);

    controller.clearState();
    expect(await controller.hydrateFromRemote('user-1')).toBe(false);
  });

  it('creates with wallet secret S and unlocks via password or passkey (1-of-N)', async () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    const secret = controller.generateWalletSecret();
    expect(secret).toHaveLength(32);

    const enrolled = await controller.createWithWalletSecret({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
      secret,
    });
    expect(bytesToHex(enrolled)).toBe(bytesToHex(secret));
    expect(controller.listFactors()).toEqual({
      password: { type: 'password' },
    });
    expect(
      secretEscrowControllerSelectors.selectFactors(controller.state),
    ).toEqual({ password: { type: 'password' } });

    await controller.addFactor({
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });
    expect(Object.keys(controller.listFactors()).sort()).toEqual([
      'passkey',
      'password',
    ]);

    await controller.startExport('password');
    const fromPassword = await controller.unlockWithFactor({
      factorId: 'password',
      proof: { type: 'password', password: 'wallet-password' },
    });
    expect(bytesToHex(fromPassword)).toBe(bytesToHex(secret));

    const { challenge } = await controller.startExport('passkey');
    const fromPasskey = await controller.unlockWithFactor({
      factorId: 'passkey',
      proof: {
        type: 'webauthn',
        assertion: { id: TEST_FACTOR.credentialId, challenge },
      },
    });
    expect(bytesToHex(fromPasskey)).toBe(bytesToHex(secret));
  });

  it('rejects addFactor duplicates and unknown unlock factors', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    await controller.createWithWalletSecret({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
    });

    await expect(
      controller.addFactor({
        factorId: 'password',
        factor: { type: 'password', password: 'other' },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.AlreadyRegistered,
    });

    await expect(controller.startExport('missing')).rejects.toMatchObject({
      code: SecretEscrowErrorCode.UnknownFactor,
    });

    await expect(
      controller.unlockWithFactor({
        factorId: 'missing',
        proof: { type: 'password', password: 'wallet-password' },
      }),
    ).rejects.toMatchObject({
      code: SecretEscrowErrorCode.UnknownFactor,
    });
  });

  it('migrates persisted records missing the factors map', () => {
    const client = new MockSecretEscrowClient();
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
      state: {
        escrowRecord: {
          userId: 'user-1',
          factorId: 'passkey',
          factor: TEST_FACTOR,
          enrolledAt: 1,
        } as never,
      },
    });

    expect(controller.listFactors()).toEqual({
      passkey: TEST_FACTOR,
    });
  });

  it('syncs remote enrollment metadata from a webauthn factor after password-first create', async () => {
    const base = new MockSecretEscrowClient();
    const client = Object.assign(base, {
      putEnrollmentMetadata: jest.fn(),
      getEnrollmentMetadata: jest.fn(),
    });

    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client,
    });

    await controller.createWithWalletSecretAndWrapPassword({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
      password: 'wallet-password',
    });
    expect(client.putEnrollmentMetadata).not.toHaveBeenCalled();

    await controller.addFactor({
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    expect(client.putEnrollmentMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        factorId: 'passkey',
        factor: TEST_FACTOR,
        factors: {
          password: { type: 'password' },
          passkey: TEST_FACTOR,
        },
      }),
    );
  });

  it('recovers a wrapped password using an explicit passkey factor id', async () => {
    const controller = new SecretEscrowController({
      messenger: createMessenger(),
      client: new MockSecretEscrowClient(),
    });
    await controller.createWithWalletSecretAndWrapPassword({
      userId: 'user-1',
      factorId: 'password',
      factor: { type: 'password', password: 'wallet-password' },
      password: 'wallet-password',
    });
    await controller.addFactor({
      factorId: 'passkey',
      factor: TEST_FACTOR,
    });

    const { challenge } = await controller.startExport('passkey');
    await expect(
      controller.recoverPassword(
        { id: TEST_FACTOR.credentialId, challenge },
        'passkey',
      ),
    ).resolves.toBe('wallet-password');
  });
});
