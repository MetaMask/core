import { Messenger } from '@metamask/messenger';
import { RemoteFeatureFlagController } from '@metamask/remote-feature-flag-controller';

import { defaultConfigurations } from '../../defaults';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import { remoteFeatureFlagController } from './remote-feature-flag-controller';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

/**
 * Creates a stub client-config API service whose `fetchRemoteFeatureFlags`
 * resolves to an empty flag set.
 *
 * @returns A stub client-config API service.
 */
function getClientConfigApiService(): { fetchRemoteFeatureFlags: jest.Mock } {
  return {
    fetchRemoteFeatureFlags: jest.fn().mockResolvedValue({
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
      options: { clientConfigApiService: getClientConfigApiService() },
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
      options: { clientConfigApiService: getClientConfigApiService() },
    });

    expect(instance.state.remoteFeatureFlags).toStrictEqual({ testFlag: true });
  });

  it('applies default getMetaMetricsId and clientVersion when omitted', async () => {
    const clientConfigApiService = getClientConfigApiService();
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: { clientConfigApiService },
    });

    await instance.updateRemoteFeatureFlags();

    expect(
      clientConfigApiService.fetchRemoteFeatureFlags,
    ).toHaveBeenCalledTimes(1);
    expect(instance.state.remoteFeatureFlags).toStrictEqual({});
  });

  it('uses the injected clientConfigApiService, getMetaMetricsId, and clientVersion', async () => {
    const fetchRemoteFeatureFlags = jest.fn().mockResolvedValue({
      remoteFeatureFlags: { testFlag: true },
      cacheTimestamp: Date.now(),
    });
    const getMetaMetricsId = jest.fn(() => 'test-metrics-id');
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {
        clientConfigApiService: { fetchRemoteFeatureFlags },
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
    const clientConfigApiService = getClientConfigApiService();
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: { clientConfigApiService, disabled: true },
    });

    await instance.updateRemoteFeatureFlags();

    expect(
      clientConfigApiService.fetchRemoteFeatureFlags,
    ).not.toHaveBeenCalled();
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
        clientConfigApiService: getClientConfigApiService(),
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
        clientConfigApiService: getClientConfigApiService(),
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
          clientConfigApiService: getClientConfigApiService(),
          clientVersion: 'not-semver',
        },
      }),
    ).toThrow('Invalid clientVersion');
  });

  it('forwards a custom fetchInterval to the controller', async () => {
    const clientConfigApiService = getClientConfigApiService();
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: { remoteFeatureFlags: {}, cacheTimestamp: Date.now() },
      messenger,
      options: { clientConfigApiService, fetchInterval: 60 * 60 * 1000 },
    });

    await instance.updateRemoteFeatureFlags();

    expect(
      clientConfigApiService.fetchRemoteFeatureFlags,
    ).not.toHaveBeenCalled();
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = remoteFeatureFlagController.getMessenger(rootMessenger);

    remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: { clientConfigApiService: getClientConfigApiService() },
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
