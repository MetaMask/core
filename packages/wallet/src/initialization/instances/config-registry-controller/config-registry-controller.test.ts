import {
  ConfigRegistryController,
} from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { configRegistryController } from './config-registry-controller.js';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  namespace: string,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace,
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

function registerDependencies(
  rootMessenger: RootMessenger<DefaultActions, DefaultEvents>,
): void {
  registerActionHandler(
    rootMessenger,
    'KeyringController',
    'KeyringController:getState',
    () => ({ isUnlocked: false }),
  );
  registerActionHandler(
    rootMessenger,
    'RemoteFeatureFlagController',
    'RemoteFeatureFlagController:getState',
    () => ({ remoteFeatureFlags: {} }),
  );
  registerActionHandler(
    rootMessenger,
    'ConfigRegistryApiService',
    'ConfigRegistryApiService:fetchConfig',
    async () => ({ modified: false }),
  );
}

describe('configRegistryController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      configRegistryController,
    );
  });

  it('initializes a ConfigRegistryController', () => {
    const rootMessenger = getRootMessenger();
    registerDependencies(rootMessenger);
    const messenger = configRegistryController.getMessenger(rootMessenger);

    const instance = configRegistryController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(ConfigRegistryController);
  });

  it('initializes with default state', () => {
    const rootMessenger = getRootMessenger();
    registerDependencies(rootMessenger);
    const messenger = configRegistryController.getMessenger(rootMessenger);

    const instance = configRegistryController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance.state).toStrictEqual({
      configs: { networks: {} },
      version: null,
      lastFetched: null,
      etag: null,
    });
  });

  it('forwards provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    registerDependencies(rootMessenger);
    const messenger = configRegistryController.getMessenger(rootMessenger);

    const instance = configRegistryController.init({
      state: { version: 'v1.0.0', lastFetched: 12345 },
      messenger,
      options: {},
    });

    expect(instance.state.version).toBe('v1.0.0');
    expect(instance.state.lastFetched).toBe(12345);
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    registerDependencies(rootMessenger);
    const messenger = configRegistryController.getMessenger(rootMessenger);

    configRegistryController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(
      rootMessenger.call('ConfigRegistryController:getState'),
    ).toStrictEqual({
      configs: { networks: {} },
      version: null,
      lastFetched: null,
      etag: null,
    });
  });
});
