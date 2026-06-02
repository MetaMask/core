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

describe('remoteFeatureFlagController', () => {
  it('is registered as a default initialization configuration', () => {
    // Proves the controller is part of the default ensemble that `initialize()`
    // wires, without constructing a `Wallet` (which keeps this PR independent of
    // the constructor-options shape).
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

  it('falls back to inert defaults that fetch no flags when no options are provided', async () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {},
    });

    // Exercises the default `clientConfigApiService` and `getMetaMetricsId`:
    // the cache is expired (timestamp 0), so this fetches via the inert default
    // service, which returns an empty flag set.
    await instance.updateRemoteFeatureFlags();

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
    const fetchRemoteFeatureFlags = jest.fn();
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      state: undefined,
      messenger,
      options: {
        clientConfigApiService: { fetchRemoteFeatureFlags },
        disabled: true,
      },
    });

    await instance.updateRemoteFeatureFlags();

    expect(fetchRemoteFeatureFlags).not.toHaveBeenCalled();
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
      options: { clientVersion: '2.0.0', prevClientVersion: '1.0.0' },
    });

    // A version change resets the cache timestamp to 0 so the next update
    // refetches rather than serving stale flags from a previous version.
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
      // Same version: invalidation must be conditional, so the timestamp is
      // preserved (this proves both versions are forwarded to the right slots,
      // not that the controller always zeroes the cache).
      options: { clientVersion: '2.0.0', prevClientVersion: '2.0.0' },
    });

    expect(instance.state.cacheTimestamp).toBe(5000);
  });

  it('does not throw with the default clientVersion', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    // The default '0.0.0' is a valid SemVer; the controller throws on invalid
    // versions, so this proves a headless consumer can construct it.
    expect(() =>
      remoteFeatureFlagController.init({
        state: undefined,
        messenger,
        options: {},
      }),
    ).not.toThrow();
  });

  it('surfaces the controller throw on an invalid clientVersion', () => {
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    expect(() =>
      remoteFeatureFlagController.init({
        state: undefined,
        messenger,
        options: { clientVersion: 'not-semver' },
      }),
    ).toThrow('Invalid clientVersion');
  });

  it('forwards a custom fetchInterval to the controller', async () => {
    const fetchRemoteFeatureFlags = jest.fn().mockResolvedValue({
      remoteFeatureFlags: {},
      cacheTimestamp: Date.now(),
    });
    const messenger =
      remoteFeatureFlagController.getMessenger(getRootMessenger());

    const instance = remoteFeatureFlagController.init({
      // A non-expired cache (recent timestamp) combined with a very large
      // fetchInterval means the cache is considered fresh, so no fetch happens.
      state: { remoteFeatureFlags: {}, cacheTimestamp: Date.now() },
      messenger,
      options: {
        clientConfigApiService: { fetchRemoteFeatureFlags },
        fetchInterval: 60 * 60 * 1000,
      },
    });

    await instance.updateRemoteFeatureFlags();

    expect(fetchRemoteFeatureFlags).not.toHaveBeenCalled();
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
