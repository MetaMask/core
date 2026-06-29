import { Messenger } from '@metamask/messenger';
import { PermissionController } from '@metamask/permission-controller';

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

  it('forwards injected specifications and unrestricted methods', () => {
    const messenger = permissionController.getMessenger(getRootMessenger());

    const instance = permissionController.init({
      state: undefined,
      messenger,
      options: {
        caveatSpecifications: {},
        permissionSpecifications: {},
        unrestrictedMethods: ['eth_chainId', 'eth_blockNumber'],
      },
    });

    expect(instance.hasUnrestrictedMethod('eth_chainId')).toBe(true);
    expect(instance.hasUnrestrictedMethod('eth_sendTransaction')).toBe(false);
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = permissionController.getMessenger(rootMessenger);

    permissionController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('PermissionController:getState')).toStrictEqual({
      subjects: {},
    });
  });
});
