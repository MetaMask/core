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
  it('returns default empty state', () => {
    expect(getDefaultSecretEscrowControllerState()).toStrictEqual({
      escrowRecord: null,
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

    const { challenge } = await controller.startExport();
    const released = await controller.completeExport({
      id: TEST_FACTOR.credentialId,
      challenge,
    });
    expect(bytesToHex(released)).toBe(bytesToHex(secret));

    await controller.revoke();
    expect(controller.isEnrolled()).toBe(false);
    expect(client.hasUser('user-1')).toBe(false);
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
});
