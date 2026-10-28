import {
  AssetsController,
  getDefaultAssetsControllerState,
} from '@metamask/assets-controller';
import type { AssetsControllerGetStateAction } from '@metamask/assets-controller';
import { ConfigRegistryApiEnv } from '@metamask/config-registry-controller';
import { Messenger } from '@metamask/messenger';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as walletExports from '../../../index.js';
import type { WalletOptions } from '../../../types.js';
import { Wallet } from '../../../Wallet.js';
import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import type { AnyInitializationConfiguration } from '../../types.js';
import { AlwaysOnlineAdapter } from '../connectivity-controller/always-online-adapter.js';
import { assetsController } from './assets-controller.js';
import type { AssetsControllerInstanceOptions } from './types.js';

const controllers: AssetsController[] = [];
const wallets: Wallet[] = [];

const REMOTE_FEATURE_FLAG_OPTIONS = {
  clientConfigApiService: {
    fetchRemoteFeatureFlags: async (): Promise<{
      remoteFeatureFlags: Record<string, boolean>;
      cacheTimestamp: number;
    }> => ({ remoteFeatureFlags: {}, cacheTimestamp: Date.now() }),
  },
};

const NETWORK_ENABLEMENT_STATE = {
  enabledNetworkMap: { eip155: { '0x1': true } },
  nativeAssetIdentifiers: { 'eip155:1': 'eip155:1/slip44:60' },
};

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

describe('assetsController', () => {
  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.destroy();
    }

    await Promise.all(wallets.splice(0).map((wallet) => wallet.destroy()));
  });

  it('is not part of the default initialization configurations', () => {
    expect(Object.values(defaultConfigurations)).not.toContain(
      assetsController,
    );
  });

  it('is exported from the package entry point', () => {
    expect(walletExports.assetsController).toBe(assetsController);
  });

  it('initializes an AssetsController with default state', () => {
    const rootMessenger = getRootMessenger();
    const messenger = assetsController.getMessenger(rootMessenger);

    const instance = assetsController.init({
      state: undefined,
      messenger,
      options: { queryApiClient: createMockQueryApiClient() },
    });
    controllers.push(instance);

    expect(instance).toBeInstanceOf(AssetsController);
    expect(instance.state).toStrictEqual(getDefaultAssetsControllerState());
  });

  it('forwards the provided state to the controller', () => {
    const rootMessenger = getRootMessenger();
    const messenger = assetsController.getMessenger(rootMessenger);

    const instance = assetsController.init({
      state: {
        ...getDefaultAssetsControllerState(),
        selectedCurrency: 'eur',
      },
      messenger,
      options: { queryApiClient: createMockQueryApiClient() },
    });
    controllers.push(instance);

    expect(instance.state.selectedCurrency).toBe('eur');
  });

  it('forwards the instance options to the controller', () => {
    const rootMessenger = getRootMessenger();
    const messenger = assetsController.getMessenger(rootMessenger);
    const unsubscribe = vi.fn();
    const subscribeToBasicFunctionalityChange = vi
      .fn()
      .mockReturnValue(unsubscribe);

    const instance = assetsController.init({
      state: undefined,
      messenger,
      options: {
        queryApiClient: createMockQueryApiClient(),
        subscribeToBasicFunctionalityChange,
      },
    });
    instance.destroy();

    expect(subscribeToBasicFunctionalityChange).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('throws when no queryApiClient is provided', () => {
    const rootMessenger = getRootMessenger();
    const messenger = assetsController.getMessenger(rootMessenger);

    expect(() =>
      assetsController.init({
        state: undefined,
        messenger,
        options: {} as AssetsControllerInstanceOptions,
      }),
    ).toThrow(
      'AssetsController requires `instanceOptions.assetsController.queryApiClient`.',
    );
  });

  it('exposes AssetsController actions over the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = assetsController.getMessenger(rootMessenger);

    const instance = assetsController.init({
      state: undefined,
      messenger,
      options: { queryApiClient: createMockQueryApiClient() },
    });
    controllers.push(instance);

    expect(
      (
        rootMessenger as unknown as Messenger<
          'Root',
          AssetsControllerGetStateAction
        >
      ).call('AssetsController:getState'),
    ).toStrictEqual(getDefaultAssetsControllerState());
  });

  it.each([
    'AccountsController:getSelectedAccount',
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    'AccountTreeController:isInitialized',
    'ClientController:getState',
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    'KeyringController:isUnlocked',
    'NetworkController:getNetworkClientById',
    'NetworkController:getState',
    'NetworkEnablementController:getState',
    'PermissionController:getPermissions',
    'PhishingController:bulkScanTokens',
    'RemoteFeatureFlagController:getState',
    'SnapController:getRunnableSnaps',
    'SnapController:handleRequest',
  ])('delegates the %s action', (actionType) => {
    const rootMessenger = new Messenger<'Root', DefaultActions, DefaultEvents>({
      namespace: 'Root',
    });
    const handler = vi.fn().mockReturnValue('result');
    registerActionHandler(rootMessenger, actionType, handler);
    const messenger = assetsController.getMessenger(rootMessenger);

    const result = (
      messenger as unknown as { call(type: string): unknown }
    ).call(actionType);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it.each([
    'AccountActivityService:balanceUpdated',
    'AccountActivityService:statusChanged',
    'AccountsController:accountBalancesUpdated',
    'AccountTreeController:initialized',
    'AccountTreeController:selectedAccountGroupChange',
    'AccountTreeController:uninitialized',
    'ClientController:stateChange',
    'KeyringController:lock',
    'KeyringController:unlock',
    'MultichainTransactionsController:transactionConfirmed',
    'NetworkController:networkAdded',
    'NetworkController:networkDidChange',
    'NetworkController:networkRemoved',
    'NetworkController:stateChange',
    'NetworkEnablementController:stateChange',
    'PermissionController:stateChange',
    'PreferencesController:stateChange',
    'RemoteFeatureFlagController:stateChange',
    'SnapController:snapInstalled',
    'TransactionController:transactionConfirmed',
    'TransactionController:unapprovedTransactionAdded',
  ])('delegates the %s event', (eventType) => {
    const rootMessenger = new Messenger<'Root', DefaultActions, DefaultEvents>({
      namespace: 'Root',
    });
    const messenger = assetsController.getMessenger(rootMessenger);
    const listener = vi.fn();
    (
      messenger as unknown as {
        subscribe(type: string, handler: ActionHandler): void;
      }
    ).subscribe(eventType, listener);

    publishEvent(rootMessenger, eventType, 'payload');

    expect(listener).toHaveBeenCalledWith('payload');
  });

  it('is constructed before the default NetworkEnablementController and reads its state during wallet init', async () => {
    const accountId = 'account-1';
    const nativeAssetId = 'eip155:1/slip44:60';
    const wallet = new Wallet({
      state: {
        AssetsController: {
          assetsBalance: {
            [accountId]: {
              [nativeAssetId]: { amount: '1' },
            },
          },
          assetsInfo: {
            [nativeAssetId]: {
              type: 'native',
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
            },
          },
        },
      },
      initializationConfigurations: [assetsController],
      instanceOptions: {
        ...getInstanceOptions(),
        assetsController: { queryApiClient: createMockQueryApiClient() },
      },
    });
    wallets.push(wallet);

    const instance = wallet.getInstance(
      'AssetsController',
    ) as unknown as AssetsController;
    expect(instance).toBeInstanceOf(AssetsController);

    await instance.init();

    // Default NetworkEnablementController state enables Ethereum mainnet.
    // init() reads that state even though this controller was constructed first.
    const assets = await instance.getAssets([
      { id: accountId } as Parameters<AssetsController['getAssets']>[0][number],
    ]);

    expect(Object.keys(assets[accountId] ?? {})).toStrictEqual([nativeAssetId]);
  });

  it('is initialized by the Wallet when passed as an initialization configuration', async () => {
    const wallet = new Wallet({
      initializationConfigurations: [
        getNetworkEnablementControllerStub(),
        assetsController,
      ],
      instanceOptions: {
        ...getInstanceOptions(),
        assetsController: { queryApiClient: createMockQueryApiClient() },
      },
    });
    wallets.push(wallet);

    const instance = wallet.getInstance('AssetsController');

    expect(instance).toBeInstanceOf(AssetsController);
    expect(
      (
        wallet.messenger as unknown as Messenger<
          'Root',
          AssetsControllerGetStateAction
        >
      ).call('AssetsController:getState'),
    ).toStrictEqual(getDefaultAssetsControllerState());
  });

  it('is destroyed with the Wallet', async () => {
    const wallet = new Wallet({
      initializationConfigurations: [
        getNetworkEnablementControllerStub(),
        assetsController,
      ],
      instanceOptions: {
        ...getInstanceOptions(),
        assetsController: { queryApiClient: createMockQueryApiClient() },
      },
    });
    const destroy = vi.spyOn(
      wallet.getInstance('AssetsController') as unknown as AssetsController,
      'destroy',
    );

    await wallet.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/**
 * Builds a minimal `queryApiClient` that serves the controller's native asset
 * query from its own `queryFn`, so no API request is made.
 *
 * @returns The mock client.
 */
function createMockQueryApiClient(): AssetsControllerInstanceOptions['queryApiClient'] {
  const cache = new Map<string, unknown>();
  return {
    getCachedData: vi.fn((key: string[]) => cache.get(JSON.stringify(key))),
    setCachedData: vi.fn((key: string[], data: unknown) =>
      cache.set(JSON.stringify(key), data),
    ),
    queryClient: {
      fetchQuery: vi.fn(
        async (opts: {
          queryKey: string[];
          queryFn: () => Promise<unknown>;
        }) => {
          const data = await opts.queryFn();
          cache.set(JSON.stringify(opts.queryKey), data);
          return data;
        },
      ),
    },
  } as unknown as AssetsControllerInstanceOptions['queryApiClient'];
}

/**
 * Builds a stand-in for the `NetworkEnablementController` configuration,
 * which the Wallet does not yet initialize by default.
 *
 * @returns The initialization configuration.
 */
function getNetworkEnablementControllerStub(): AnyInitializationConfiguration {
  return {
    name: 'NetworkEnablementController',
    getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
      registerActionHandler(
        parent,
        'NetworkEnablementController:getState',
        () => NETWORK_ENABLEMENT_STATE,
      );
      return new Messenger({ namespace: 'NetworkEnablementControllerStub' });
    },
    init: (): object => ({}),
  };
}

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  const rootMessenger = new Messenger<'Root', DefaultActions, DefaultEvents>({
    namespace: 'Root',
  });

  registerActionHandler(
    rootMessenger,
    'NetworkEnablementController:getState',
    () => NETWORK_ENABLEMENT_STATE,
  );

  return rootMessenger;
}

function getInstanceOptions(): WalletOptions['instanceOptions'] {
  return {
    analyticsController: {
      platformAdapter: {
        track: vi.fn(),
        identify: vi.fn(),
        view: vi.fn(),
        onSetupCompleted: vi.fn(),
      },
      analyticsId: '11111111-1111-4111-8111-111111111111',
    },
    configRegistryApiService: { env: ConfigRegistryApiEnv.PRD },
    connectivityController: {
      connectivityAdapter: new AlwaysOnlineAdapter(),
    },
    gasFeeController: {
      clientId: 'test',
    },
    networkController: {
      infuraProjectId: 'test-infura-project-id',
    },
    selectedNetworkController: {
      domainProxyMap: new Map(),
    },
    storageService: {
      storage: new InMemoryStorageAdapter(),
    },
    remoteFeatureFlagController: REMOTE_FEATURE_FLAG_OPTIONS,
  };
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace: actionType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

function publishEvent(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  eventType: string,
  ...payload: unknown[]
): void {
  const messenger = new Messenger({
    namespace: eventType.split(':')[0],
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      publish(type: string, ...payload: unknown[]): void;
    }
  ).publish(eventType, ...payload);
}
