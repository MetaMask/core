import { Messenger } from '@metamask/messenger';
import { RemoteFeatureFlagController } from '@metamask/remote-feature-flag-controller';
import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { clientConfigApiService } from '../client-config-api-service/client-config-api-service.js';
import { remoteFeatureFlagController } from './remote-feature-flag-controller.js';

/**
 * Creates a root messenger with a stub ClientConfigApiService action handler.
 *
 * @param stub - The stub whose `fetchRemoteFeatureFlags` backs the action.
 * @param stub.fetchRemoteFeatureFlags - The mock to call.
 * @returns A root messenger.
 */
function getRootMessenger(
  stub: {
    fetchRemoteFeatureFlags: Mock;
  } = getClientConfigApiService(),
): RootMessenger<DefaultActions, DefaultEvents> {
  const rootMessenger: RootMessenger<DefaultActions, DefaultEvents> =
    new Messenger({ namespace: 'Root' });
  clientConfigApiService
    .getMessenger(rootMessenger)
    .registerActionHandler(
      'ClientConfigApiService:fetchRemoteFeatureFlags',
      async () =>
        stub.fetchRemoteFeatureFlags() as ReturnType<
          ClientConfigApiService['fetchRemoteFeatureFlags']
        >,
    );
  return rootMessenger;
}

/**
 * Creates a stub client-config API service whose `fetchRemoteFeatureFlags`
 * resolves to an empty flag set.
 *
 * @returns A stub client-config API service.
 */
function getClientConfigApiService(): { fetchRemoteFeatureFlags: Mock } {
  return {
    fetchRemoteFeatureFlags: vi.fn().mockResolvedValue({
      remoteFeatureFlags: {},
      cacheTimestamp: Date.now(),
    }),
  };
}

describe('remoteFeatureFlagController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      remoteFeatureFlagController,
    );
  });

  it('initializes a RemoteFeatureFlagController with default state', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(RemoteFeatureFlagController);
    expect(instance.state).toStrictEqual({
      remoteFeatureFlags: {},
      localOverrides: {},
      rawRemoteFeatureFlags: {},
      cacheTimestamp: 0,
    });
  });

  it('forwards the provided state to the controller', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: {
        remoteFeatureFlags: { testFlag: true },
        cacheTimestamp: 12345,
      },
      messenger,
      options: {},
    });

    expect(instance.state.remoteFeatureFlags).toStrictEqual({ testFlag: true });
  });

  it('applies default getMetaMetricsId and clientVersion when omitted', async () => {
    const stub = getClientConfigApiService();
    const messenger = remoteFeatureFlagController.getMessenger(
      getRootMessenger(stub),
    );

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {},
    });

    await instance.updateRemoteFeatureFlags();

    expect(stub.fetchRemoteFeatureFlags).toHaveBeenCalledTimes(1);
    expect(instance.state.remoteFeatureFlags).toStrictEqual({});
  });

  it('uses the ClientConfigApiService action, getMetaMetricsId, and clientVersion', async () => {
    const fetchRemoteFeatureFlags = vi.fn().mockResolvedValue({
      remoteFeatureFlags: { testFlag: true },
      cacheTimestamp: Date.now(),
    });
    const getMetaMetricsId = vi.fn(() => 'test-metrics-id');
    const messenger = remoteFeatureFlagController.getMessenger(
      getRootMessenger({ fetchRemoteFeatureFlags }),
    );

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {
        getMetaMetricsId,
        clientVersion: '1.2.3',
      },
    });

    await instance.updateRemoteFeatureFlags();

    expect(fetchRemoteFeatureFlags).toHaveBeenCalledTimes(1);
    expect(getMetaMetricsId).toHaveBeenCalled();
    expect(instance.state.remoteFeatureFlags).toStrictEqual({ testFlag: true });
  });

  it('does not fetch flags when initialized as disabled', async () => {
    const stub = getClientConfigApiService();
    const messenger = remoteFeatureFlagController.getMessenger(
      getRootMessenger(stub),
    );

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: { disabled: true },
    });

    await instance.updateRemoteFeatureFlags();

    expect(stub.fetchRemoteFeatureFlags).not.toHaveBeenCalled();
  });

  it('invalidates the cache when prevClientVersion differs from clientVersion', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: {
        remoteFeatureFlags: { testFlag: true },
        cacheTimestamp: Date.now(),
      },
      messenger,
      options: {
        clientVersion: '2.0.0',
        prevClientVersion: '1.0.0',
      },
    });

    expect(instance.state.cacheTimestamp).toBe(0);
  });

  it('preserves the cache when prevClientVersion matches clientVersion', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: {
        remoteFeatureFlags: { testFlag: true },
        cacheTimestamp: 5000,
      },
      messenger,
      options: {
        clientVersion: '2.0.0',
        prevClientVersion: '2.0.0',
      },
    });

    expect(instance.state.cacheTimestamp).toBe(5000);
  });

  it('surfaces the controller throw on an invalid clientVersion', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    expect(() =>
      remoteFeatureFlagController.init({
        state: undefined,
        messenger,
        options: {
          clientVersion: 'not-semver',
        },
      }),
    ).toThrow('Invalid clientVersion');
  });

  it('forwards a custom fetchInterval to the controller', async () => {
    const stub = getClientConfigApiService();
    const messenger = remoteFeatureFlagController.getMessenger(
      getRootMessenger(stub),
    );

    const instance = remoteFeatureFlagController.init({
      state: { remoteFeatureFlags: {}, cacheTimestamp: Date.now() },
      messenger,
      options: { fetchInterval: 60 * 60 * 1000 },
    });

    await instance.updateRemoteFeatureFlags();

    expect(stub.fetchRemoteFeatureFlags).not.toHaveBeenCalled();
  });

  it('forwards defaultFeatureFlags to the controller', async () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {
        defaultFeatureFlags: { defaultFlag: true },
      },
    });

    await instance.init();

    expect(instance.state.remoteFeatureFlags).toStrictEqual({
      defaultFlag: true,
    });
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = remoteFeatureFlagController.getMessenger(rootMessenger);

    remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(
      rootMessenger.call('RemoteFeatureFlagController:getState'),
    ).toStrictEqual({
      remoteFeatureFlags: {},
      localOverrides: {},
      rawRemoteFeatureFlags: {},
      cacheTimestamp: 0,
    });
  });
});
