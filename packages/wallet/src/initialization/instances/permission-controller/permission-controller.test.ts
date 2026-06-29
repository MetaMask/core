import { Messenger } from '@metamask/messenger';
import {
  PermissionController,
  PermissionType,
} from '@metamask/permission-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { permissionController } from './permission-controller';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('permissionController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      permissionController,
    );
  });

  it('initializes a PermissionController with default state and no permissions registered', () => {
    const messenger = permissionController.getMessenger(getRootMessenger());

    const instance = permissionController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(PermissionController);
    expect(instance.state).toStrictEqual({ subjects: {} });
    expect(instance.unrestrictedMethods).toStrictEqual(new Set());
  });

  it('forwards the provided state to the controller', () => {
    const messenger = permissionController.getMessenger(getRootMessenger());

    const subjects = {
      'https://metamask.io': {
        origin: 'https://metamask.io',
        permissions: {},
      },
    };

    const instance = permissionController.init({
      state: { subjects },
      messenger,
      options: {},
    });

    expect(instance.state.subjects).toStrictEqual(subjects);
  });

  it('forwards injected unrestrictedMethods to the controller', () => {
    const messenger = permissionController.getMessenger(getRootMessenger());

    const instance = permissionController.init({
      state: undefined,
      messenger,
      options: { unrestrictedMethods: ['eth_chainId', 'eth_blockNumber'] },
    });

    expect(instance.hasUnrestrictedMethod('eth_chainId')).toBe(true);
    expect(instance.hasUnrestrictedMethod('eth_sendTransaction')).toBe(false);
  });

  it('forwards injected permission specifications to the controller', () => {
    const messenger = permissionController.getMessenger(getRootMessenger());
    const origin = 'https://metamask.io';

    const instance = permissionController.init({
      state: undefined,
      messenger,
      options: {
        permissionSpecifications: {
          wallet_noop: {
            permissionType: PermissionType.RestrictedMethod,
            targetName: 'wallet_noop',
            allowedCaveats: null,
            methodImplementation: () => null,
          },
        },
      },
    });

    // Granting the injected permission only succeeds if its specification was
    // forwarded to the controller; an unknown target would throw.
    instance.grantPermissions({
      subject: { origin },
      approvedPermissions: { wallet_noop: {} },
    });

    expect(instance.getPermissions(origin)).toHaveProperty('wallet_noop');
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = permissionController.getMessenger(rootMessenger);

    permissionController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('PermissionController:getState')).toStrictEqual({
      subjects: {},
    });
  });

  it('can reach the actions delegated to its messenger', () => {
    const rootMessenger = getRootMessenger();

    // Register stub handlers as the real ApprovalController and
    // SubjectMetadataController would, then confirm the PermissionController's
    // messenger can call them — proving the delegation allowlist is wired.
    const approvalControllerMessenger = new Messenger({
      namespace: 'ApprovalController',
      parent: rootMessenger,
    });
    approvalControllerMessenger.registerActionHandler(
      'ApprovalController:hasRequest',
      () => true,
    );
    const subjectMetadataControllerMessenger = new Messenger({
      namespace: 'SubjectMetadataController',
      parent: rootMessenger,
    });
    subjectMetadataControllerMessenger.registerActionHandler(
      'SubjectMetadataController:getSubjectMetadata',
      () => undefined,
    );

    const messenger = permissionController.getMessenger(rootMessenger);

    expect(messenger.call('ApprovalController:hasRequest', { id: 'x' })).toBe(
      true,
    );
    expect(
      messenger.call(
        'SubjectMetadataController:getSubjectMetadata',
        'https://metamask.io',
      ),
    ).toBeUndefined();
  });
});
