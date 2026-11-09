import {
  AssetsController,
  getDefaultAssetsControllerState,
} from '@metamask/assets-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import {
  assetsController,
  getAssetsControllerOptions,
} from './assets-controller.js';
import type { AssetsControllerInstanceOptions } from './types.js';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

/**
 * Creates a stub API Platform client with just enough surface for the
 * controller to construct and bootstrap.
 *
 * @returns A stub API Platform client.
 */
function getQueryApiClient(): AssetsControllerInstanceOptions['queryApiClient'] {
  return {
    getCachedData: vi.fn(),
    setCachedData: vi.fn(),
    queryClient: { fetchQuery: vi.fn().mockResolvedValue({}) },
  } as unknown as AssetsControllerInstanceOptions['queryApiClient'];
}

describe('assetsController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(assetsController);
  });

  it('initializes an AssetsController with default state', () => {
    const messenger = assetsController.getMessenger(getRootMessenger());

    const instance = assetsController.init({
      state: undefined,
      messenger,
      options: { queryApiClient: getQueryApiClient() },
    });

    expect(instance).toBeInstanceOf(AssetsController);
    expect(instance.state).toStrictEqual(getDefaultAssetsControllerState());
  });

  it('forwards the provided state to the controller', () => {
    const messenger = assetsController.getMessenger(getRootMessenger());

    const instance = assetsController.init({
      state: {
        ...getDefaultAssetsControllerState(),
        selectedCurrency: 'eur',
      },
      messenger,
      options: { queryApiClient: getQueryApiClient() },
    });

    expect(instance.state.selectedCurrency).toBe('eur');
  });

  it('constructs without any of the controllers it depends on', () => {
    const rootMessenger = getRootMessenger();
    const callSpy = vi.spyOn(rootMessenger, 'call');
    const messenger = assetsController.getMessenger(rootMessenger);

    expect(() =>
      assetsController.init({
        state: undefined,
        messenger,
        options: { queryApiClient: getQueryApiClient() },
      }),
    ).not.toThrow();
    expect(callSpy).not.toHaveBeenCalled();
  });

  it('applies the wallet default poll intervals', () => {
    const queryApiClient = getQueryApiClient();

    expect(getAssetsControllerOptions({ queryApiClient })).toStrictEqual({
      queryApiClient,
      priceDataSourceConfig: { pollInterval: 180_000 },
      stakedBalanceDataSourceConfig: { pollInterval: 30_000 },
    });
  });

  it('lets client options override and extend the wallet defaults', () => {
    const queryApiClient = getQueryApiClient();
    const isOnboarded = (): boolean => true;
    const tokenDetectionEnabled = (): boolean => false;

    expect(
      getAssetsControllerOptions({
        queryApiClient,
        isOnboarded,
        rpcDataSourceConfig: { tokenDetectionEnabled },
        priceDataSourceConfig: { pollInterval: 60_000 },
        stakedBalanceDataSourceConfig: { enabled: false },
      }),
    ).toStrictEqual({
      queryApiClient,
      isOnboarded,
      rpcDataSourceConfig: { tokenDetectionEnabled },
      priceDataSourceConfig: { pollInterval: 60_000 },
      stakedBalanceDataSourceConfig: { pollInterval: 30_000, enabled: false },
    });
  });

  it('bootstraps through the delegated messenger the first time the UI opens', async () => {
    // A namespace that may register actions for any controller.
    const rootMessenger = new Messenger<
      MockAnyNamespace,
      DefaultActions,
      DefaultEvents
    >({ namespace: MOCK_ANY_NAMESPACE });
    const getNetworkEnablementState = vi.fn(() => ({
      enabledNetworkMap: {},
      nativeAssetIdentifiers: {},
    }));
    rootMessenger.registerActionHandler(
      'NetworkEnablementController:getState',
      getNetworkEnablementState,
    );
    const subscribeToBasicFunctionalityChange = vi.fn();
    const messenger = assetsController.getMessenger(
      rootMessenger as unknown as RootMessenger<DefaultActions, DefaultEvents>,
    );

    const instance = assetsController.init({
      state: undefined,
      messenger,
      options: {
        queryApiClient: getQueryApiClient(),
        subscribeToBasicFunctionalityChange,
      },
    });
    expect(getNetworkEnablementState).not.toHaveBeenCalled();

    rootMessenger.publish(
      'ClientController:stateChange',
      { isUiOpen: true },
      [],
    );
    await vi.waitFor(() =>
      expect(subscribeToBasicFunctionalityChange).toHaveBeenCalled(),
    );

    expect(getNetworkEnablementState).toHaveBeenCalled();

    instance.destroy();
  });
});
