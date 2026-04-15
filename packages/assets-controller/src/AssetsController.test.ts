/* eslint-disable jest/unbound-method */
import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';
import type { ApiPlatformClient } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import {
  AssetsController,
  getDefaultAssetsControllerState,
} from './AssetsController';
import type {
  AssetsControllerMessenger,
  AssetsControllerState,
} from './AssetsController';
import type { PriceDataSourceConfig } from './data-sources/PriceDataSource';
import { PriceDataSource } from './data-sources/PriceDataSource';
import { TokenDataSource } from './data-sources/TokenDataSource';
import type {
  Caip19AssetId,
  AccountId,
  DataRequest,
  DataResponse,
  FungibleAssetMetadata,
} from './types';
import { formatExchangeRatesForBridge } from './utils';

jest.mock('./utils', () => {
  const actual = jest.requireActual<typeof import('./utils')>('./utils');
  return {
    ...actual,
    formatExchangeRatesForBridge: jest.fn(actual.formatExchangeRatesForBridge),
  };
});

const formatExchangeRatesForBridgeMock = jest.mocked(
  formatExchangeRatesForBridge,
);

/**
 * Flush pending microtasks so fire-and-forget background pipelines settle
 * before Jest tears down the test.  Multiple rounds are needed because the
 * background pipeline chains several async steps.
 *
 * @returns A promise that resolves after pending callbacks.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createMockQueryApiClient(): ApiPlatformClient {
  return { fetch: jest.fn() } as unknown as ApiPlatformClient;
}

type AllActions = MessengerActions<AssetsControllerMessenger>;
type AllEvents = MessengerEvents<AssetsControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_ACCOUNT_ID = 'mock-account-id-1';
const MOCK_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_ASSET_ID_LOWERCASE =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const MOCK_NATIVE_ASSET_ID = 'eip155:1/slip44:60' as Caip19AssetId;

function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
    address: '0x1234567890123456789012345678901234567890',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:1'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

type WithControllerOptions = {
  state?: Partial<AssetsControllerState>;
  isBasicFunctionality?: () => boolean;
  /**
   * When set, registers ClientController:getState so the controller sees this UI state.
   * Required for tests that rely on asset tracking running (e.g. trace on unlock).
   */
  clientControllerState?: { isUiOpen: boolean };
  /** Extra options passed to AssetsController constructor (e.g. trace). */
  controllerOptions?: Partial<{
    trace: TraceCallback;
    priceDataSourceConfig: PriceDataSourceConfig;
    isEnabled: () => boolean;
  }>;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
}: {
  controller: AssetsController;
  messenger: RootMessenger;
}) => Promise<ReturnValue> | ReturnValue;

async function withController<ReturnValue>(
  options: WithControllerOptions,
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    {
      state = {},
      isBasicFunctionality = (): boolean => true,
      clientControllerState,
      controllerOptions = {},
    },
    fn,
  ]: [WithControllerOptions, WithControllerCallback<ReturnValue>] =
    args.length === 2 ? args : [{}, args[0]];

  // Use root messenger (MOCK_ANY_NAMESPACE) so data sources can register their actions.
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  // Mock AccountsController
  (
    messenger as {
      registerActionHandler: (a: string, h: () => unknown) => void;
    }
  ).registerActionHandler('AccountsController:getSelectedAccount', () =>
    createMockInternalAccount(),
  );

  // Mock AccountTreeController
  messenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => [createMockInternalAccount()],
  );

  // Mock NetworkEnablementController
  messenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: {
        eip155: {
          '1': true,
        },
      },
      nativeAssetIdentifiers: {
        'eip155:1': 'eip155:1/slip44:60',
      },
    }),
  );

  (
    messenger as {
      registerActionHandler: (a: string, h: () => unknown) => void;
    }
  ).registerActionHandler('NetworkController:getState', () => ({
    networkConfigurationsByChainId: {},
    networksMetadata: {},
  }));
  (
    messenger as {
      registerActionHandler: (a: string, h: () => unknown) => void;
    }
  ).registerActionHandler('NetworkController:getNetworkClientById', () => ({
    provider: {},
  }));

  if (clientControllerState !== undefined) {
    (
      messenger as {
        registerActionHandler: (a: string, h: () => unknown) => void;
      }
    ).registerActionHandler(
      'ClientController:getState',
      () => clientControllerState,
    );
  }

  const controller = new AssetsController({
    messenger: messenger as unknown as AssetsControllerMessenger,
    state,
    queryApiClient: createMockQueryApiClient(),
    isBasicFunctionality,
    subscribeToBasicFunctionalityChange: (): void => {
      /* no-op for tests */
    },
    ...controllerOptions,
  });

  try {
    return await fn({ controller, messenger });
  } finally {
    await flushPromises();
    controller.destroy();
  }
}

describe('AssetsController', () => {
  describe('getDefaultAssetsControllerState', () => {
    it('returns default state with empty maps', () => {
      const defaultState = getDefaultAssetsControllerState();

      expect(defaultState).toStrictEqual({
        assetsInfo: {},
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
        selectedCurrency: 'usd',
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          assetsInfo: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
          selectedCurrency: 'usd',
        });
      });
    });

    it('initializes with provided state', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: {
          [MOCK_ASSET_ID]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsBalance: {},
        customAssets: {},
        selectedCurrency: 'eur',
      };

      await withController({ state: initialState }, ({ controller }) => {
        expect(controller.state.assetsInfo[MOCK_ASSET_ID]).toStrictEqual({
          type: 'erc20',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        });
        expect(controller.state.selectedCurrency).toBe('eur');
      });
    });

    it('skips initialization when isEnabled returns false', () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getState', () => ({
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      }));
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getNetworkClientById', () => ({
        provider: {},
      }));

      const controller = new AssetsController({
        messenger: messenger as unknown as AssetsControllerMessenger,
        isEnabled: (): boolean => false,
        queryApiClient: createMockQueryApiClient(),
        subscribeToBasicFunctionalityChange: (): void => {
          /* no-op for tests */
        },
      });

      // Controller should still have default state (from super() call)
      expect(controller.state).toStrictEqual({
        assetPreferences: {},
        assetsInfo: {},
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
        selectedCurrency: 'usd',
      });

      // Action handlers should NOT be registered when disabled
      expect(() => {
        (messenger.call as CallableFunction)('AssetsController:getAssets', [
          createMockInternalAccount(),
        ]);
      }).toThrow(
        'A handler for AssetsController:getAssets has not been registered',
      );
    });

    it('initializes normally when isEnabled returns true', async () => {
      await withController(({ controller, messenger }) => {
        // Controller should have default state
        expect(controller.state).toStrictEqual({
          assetPreferences: {},
          assetsInfo: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
          selectedCurrency: 'usd',
        });

        // Action handlers should be registered
        expect(() => {
          (messenger.call as CallableFunction)(
            'AssetsController:getCustomAssets',
            MOCK_ACCOUNT_ID,
          );
        }).not.toThrow();
      });
    });

    it('accepts accountsApiDataSourceConfig option', () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      expect(
        () =>
          new AssetsController({
            messenger: messenger as unknown as AssetsControllerMessenger,
            isEnabled: (): boolean => false,
            queryApiClient: createMockQueryApiClient(),
            subscribeToBasicFunctionalityChange: (): void => {
              /* no-op */
            },
            accountsApiDataSourceConfig: {
              pollInterval: 15_000,
              tokenDetectionEnabled: (): boolean => false,
            },
          }),
      ).not.toThrow();
    });

    it('accepts priceDataSourceConfig option', () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getState', () => ({
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      }));
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getNetworkClientById', () => ({
        provider: {},
      }));

      expect(
        () =>
          new AssetsController({
            messenger: messenger as unknown as AssetsControllerMessenger,
            isEnabled: (): boolean => false,
            queryApiClient: createMockQueryApiClient(),
            subscribeToBasicFunctionalityChange: (): void => {
              /* no-op */
            },
            priceDataSourceConfig: {
              pollInterval: 120_000,
            },
          }),
      ).not.toThrow();
    });

    it('accepts isBasicFunctionality option and exposes handleBasicFunctionalityChange', async () => {
      await withController(async ({ controller }) => {
        expect(controller.handleBasicFunctionalityChange).toBeDefined();
        expect(() =>
          controller.handleBasicFunctionalityChange(true),
        ).not.toThrow();
      });
    });

    it('works with isBasicFunctionality false (RPC-only mode)', async () => {
      await withController(
        { state: {}, isBasicFunctionality: () => false },
        async ({ controller }) => {
          const accounts = [createMockInternalAccount()];
          const assets = await controller.getAssets(accounts, {
            forceUpdate: true,
          });
          expect(assets).toBeDefined();
          expect(assets[MOCK_ACCOUNT_ID]).toBeDefined();
          expect(() =>
            controller.handleBasicFunctionalityChange(false),
          ).not.toThrow();
        },
      );
    });
  });

  describe('addCustomAsset', () => {
    it('adds a custom asset to an account', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toContain(
          MOCK_ASSET_ID,
        );
      });
    });

    it('normalizes asset IDs by checksumming addresses', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(
          MOCK_ACCOUNT_ID,
          MOCK_ASSET_ID_LOWERCASE,
        );

        // The stored asset ID should be checksummed
        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toContain(
          MOCK_ASSET_ID,
        );
      });
    });

    it('does not add duplicate custom assets', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toHaveLength(1);
      });
    });

    it('adds multiple custom assets to the same account', async () => {
      // Use a valid checksummed address (DAI token address)
      const secondAssetId =
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;

      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, secondAssetId);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toHaveLength(2);
      });
    });
  });

  describe('removeCustomAsset', () => {
    it('removes a custom asset from an account', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
        controller.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toBeUndefined();
      });
    });

    it('handles removing non-existent asset gracefully', async () => {
      await withController(({ controller }) => {
        // Should not throw
        controller.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toBeUndefined();
      });
    });

    it('removes only the specified asset', async () => {
      // Use a valid checksummed address (DAI token address)
      const secondAssetId =
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;

      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, secondAssetId);
        controller.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(controller.state.customAssets[MOCK_ACCOUNT_ID]).toHaveLength(1);
        // The stored asset should be checksummed - DAI token address
        expect(controller.state.customAssets[MOCK_ACCOUNT_ID][0]).toContain(
          '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        );
      });
    });
  });

  describe('getCustomAssets', () => {
    it('returns empty array for account with no custom assets', async () => {
      await withController(({ controller }) => {
        const customAssets = controller.getCustomAssets(MOCK_ACCOUNT_ID);

        expect(customAssets).toStrictEqual([]);
      });
    });

    it('returns custom assets for an account', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        const customAssets = controller.getCustomAssets(MOCK_ACCOUNT_ID);

        expect(customAssets).toStrictEqual([MOCK_ASSET_ID]);
      });
    });

    it('returns custom assets for specific account only', async () => {
      const secondAccountId = 'mock-account-id-2' as AccountId;

      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        const customAssetsFirstAccount =
          controller.getCustomAssets(MOCK_ACCOUNT_ID);
        const customAssetsSecondAccount =
          controller.getCustomAssets(secondAccountId);

        expect(customAssetsFirstAccount).toStrictEqual([MOCK_ASSET_ID]);
        expect(customAssetsSecondAccount).toStrictEqual([]);
      });
    });
  });

  describe('getAssetMetadata', () => {
    it('returns metadata for existing asset', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: {
          [MOCK_ASSET_ID]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
      };

      await withController({ state: initialState }, ({ controller }) => {
        const metadata = controller.getAssetMetadata(MOCK_ASSET_ID);

        expect(metadata).toStrictEqual({
          type: 'erc20',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        });
      });
    });

    it('returns undefined for non-existent asset', async () => {
      await withController(({ controller }) => {
        const metadata = controller.getAssetMetadata(MOCK_ASSET_ID);

        expect(metadata).toBeUndefined();
      });
    });
  });

  describe('getAssets', () => {
    it('returns empty object when no balances exist', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const assets = await controller.getAssets(accounts);

        expect(assets[MOCK_ACCOUNT_ID]).toStrictEqual({});
      });
    });

    it('runs fetch pipeline with forceUpdate option', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const assets = await controller.getAssets(accounts, {
          forceUpdate: true,
        });

        expect(assets).toBeDefined();
        // When queryApiClient is not provided, no data sources run; result is from state
      });
    });

    describe('pipeline splitting', () => {
      it('returns from getAssets before background pipelines complete', async () => {
        // Spy on handleAssetsUpdate to count how many times state is written.
        // Fast pipeline commits once; background pipelines each commit once more.
        await withController(async ({ controller }) => {
          const updateSpy = jest.spyOn(controller, 'handleAssetsUpdate');

          await controller.getAssets([createMockInternalAccount()], {
            forceUpdate: true,
          });

          // getAssets has returned — fast pipeline committed to state.
          // Background pipelines are still in flight (fire-and-forget).
          expect(updateSpy).not.toHaveBeenCalled(); // internal #updateState, not handleAssetsUpdate

          // Let all pending microtasks resolve so background pipelines finish.
          await flushPromises();

          updateSpy.mockRestore();
        });
      });

      it('getAssets resolves without error in basic functionality mode', async () => {
        await withController(async ({ controller }) => {
          const assets = await controller.getAssets(
            [createMockInternalAccount()],
            { forceUpdate: true },
          );
          expect(assets).toBeDefined();

          await flushPromises();
        });
      });

      it('background pipelines merge state without overwriting fast-pipeline results', async () => {
        const initialState: Partial<AssetsControllerState> = {
          assetsBalance: {
            [MOCK_ACCOUNT_ID]: {
              [MOCK_NATIVE_ASSET_ID]: { amount: '1' },
            },
          },
        };

        await withController(
          { state: initialState },
          async ({ controller }) => {
            await controller.getAssets([createMockInternalAccount()], {
              forceUpdate: true,
            });

            await flushPromises();

            // Background pipelines use 'merge' mode — they don't wipe existing entries.
            expect(
              controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
                MOCK_NATIVE_ASSET_ID
              ],
            ).toBeDefined();
          },
        );
      });

      it('getAssets resolves without error when isBasicFunctionality is false', async () => {
        await withController(
          { isBasicFunctionality: () => false },
          async ({ controller }) => {
            const assets = await controller.getAssets(
              [createMockInternalAccount()],
              { forceUpdate: true },
            );
            expect(assets).toBeDefined();

            await flushPromises();
          },
        );
      });

      it('does not run token or price middleware in getAssets pipelines when isBasicFunctionality is false', async () => {
        const tokenMiddlewareGetter = jest.spyOn(
          TokenDataSource.prototype,
          'assetsMiddleware',
          // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
          'get',
        ) as unknown as jest.SpyInstance;
        const priceMiddlewareGetter = jest.spyOn(
          PriceDataSource.prototype,
          'assetsMiddleware',
          // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
          'get',
        ) as unknown as jest.SpyInstance;

        await withController(
          { isBasicFunctionality: () => false },
          async ({ controller }) => {
            tokenMiddlewareGetter.mockClear();
            priceMiddlewareGetter.mockClear();

            await controller.getAssets([createMockInternalAccount()], {
              forceUpdate: true,
            });
            await flushPromises();
          },
        );

        expect(tokenMiddlewareGetter).not.toHaveBeenCalled();
        expect(priceMiddlewareGetter).not.toHaveBeenCalled();

        tokenMiddlewareGetter.mockRestore();
        priceMiddlewareGetter.mockRestore();
      });
    });

    it('filters by chainIds option', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const assets = await controller.getAssets(accounts, {
          chainIds: ['eip155:1'],
          forceUpdate: true,
        });

        expect(assets).toBeDefined();
      });
    });

    it('hides native tokens on Tempo testnet (eip155:42431)', async () => {
      await withController(
        {
          state: {
            assetsInfo: {
              'eip155:42431/slip44:60': {
                type: 'native',
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
              },
              'eip155:42431/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
                type: 'erc20',
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 6,
              },
            },
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                'eip155:42431/slip44:60': {
                  amount: '1',
                  unit: 'ETH',
                },
                'eip155:42431/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48':
                  {
                    amount: '100',
                    unit: 'USDC',
                  },
              },
            },
            assetsPrice: {},
            customAssets: {},
            assetPreferences: {},
          },
        },
        async ({ controller }) => {
          const accounts = [createMockInternalAccount()];
          const assets = await controller.getAssets(accounts, {
            chainIds: ['eip155:42431'],
          });

          // Native token should be hidden
          expect(
            assets[MOCK_ACCOUNT_ID]['eip155:42431/slip44:60'],
          ).toBeUndefined();

          // ERC20 token should still be visible
          expect(
            assets[MOCK_ACCOUNT_ID][
              'eip155:42431/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
            ],
          ).toBeDefined();
        },
      );
    });

    it('hides native tokens on Tempo mainnet (eip155:4217)', async () => {
      await withController(
        {
          state: {
            assetsInfo: {
              'eip155:4217/slip44:60': {
                type: 'native',
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
              },
            },
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                'eip155:4217/slip44:60': {
                  amount: '1',
                  unit: 'ETH',
                },
              },
            },
            assetsPrice: {},
            customAssets: {},
            assetPreferences: {},
          },
        },
        async ({ controller }) => {
          const accounts = [createMockInternalAccount()];
          const assets = await controller.getAssets(accounts, {
            chainIds: ['eip155:4217'],
          });

          // Native token should be hidden
          expect(
            assets[MOCK_ACCOUNT_ID]['eip155:4217/slip44:60'],
          ).toBeUndefined();
        },
      );
    });

    it('does not hide native tokens on non-Tempo networks', async () => {
      await withController(
        {
          state: {
            assetsInfo: {
              'eip155:1/slip44:60': {
                type: 'native',
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
              },
            },
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                'eip155:1/slip44:60': {
                  amount: '1',
                  unit: 'ETH',
                },
              },
            },
            assetsPrice: {},
            customAssets: {},
            assetPreferences: {},
          },
        },
        async ({ controller }) => {
          const accounts = [createMockInternalAccount()];
          const assets = await controller.getAssets(accounts, {
            chainIds: ['eip155:1'],
          });

          // Native token should still be visible on Ethereum
          expect(assets[MOCK_ACCOUNT_ID]['eip155:1/slip44:60']).toBeDefined();
          expect(
            assets[MOCK_ACCOUNT_ID]['eip155:1/slip44:60'].metadata.symbol,
          ).toBe('ETH');
        },
      );
    });

    it('hides native tokens identified by metadata type', async () => {
      await withController(
        {
          state: {
            assetsInfo: {
              'eip155:42431/some:other': {
                type: 'native',
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
              },
            },
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                'eip155:42431/some:other': {
                  amount: '1',
                  unit: 'ETH',
                },
              },
            },
            assetsPrice: {},
            customAssets: {},
            assetPreferences: {},
          },
        },
        async ({ controller }) => {
          const accounts = [createMockInternalAccount()];
          const assets = await controller.getAssets(accounts, {
            chainIds: ['eip155:42431'],
          });

          // Native token should be hidden even if assetId doesn't have slip44
          expect(
            assets[MOCK_ACCOUNT_ID]['eip155:42431/some:other'],
          ).toBeUndefined();
        },
      );
    });
  });

  describe('handleAssetsUpdate', () => {
    it('preserves existing rich metadata when the API response has empty symbol and name', async () => {
      const richMetadata: FungibleAssetMetadata = {
        type: 'erc20',
        symbol: 'TST',
        name: 'Test Token',
        decimals: 4,
        image: 'https://example.com/tst.png',
      };

      await withController(
        {
          state: {
            assetsInfo: {
              [MOCK_ASSET_ID]: richMetadata,
            },
          },
        },
        async ({ controller }) => {
          const emptyApiResponse: DataResponse = {
            assetsInfo: {
              [MOCK_ASSET_ID]: {
                type: 'erc20',
                symbol: '',
                name: '',
                decimals: 18,
              } as FungibleAssetMetadata,
            },
          };

          await controller.handleAssetsUpdate(emptyApiResponse, 'test-source');

          const stored = controller.state.assetsInfo[
            MOCK_ASSET_ID
          ] as FungibleAssetMetadata;
          expect(stored.symbol).toBe('TST');
          expect(stored.name).toBe('Test Token');
          expect(stored.decimals).toBe(4);
          expect(stored.image).toBe('https://example.com/tst.png');
        },
      );
    });

    it('uses API metadata when symbol or name is non-empty', async () => {
      const initialMetadata: FungibleAssetMetadata = {
        type: 'erc20',
        symbol: 'OLD',
        name: 'Old Token',
        decimals: 6,
      };

      await withController(
        {
          state: {
            assetsInfo: {
              [MOCK_ASSET_ID]: initialMetadata,
            },
          },
        },
        async ({ controller }) => {
          const apiResponse: DataResponse = {
            assetsInfo: {
              [MOCK_ASSET_ID]: {
                type: 'erc20',
                symbol: 'NEW',
                name: 'New Token',
                decimals: 8,
              } as FungibleAssetMetadata,
            },
          };

          await controller.handleAssetsUpdate(apiResponse, 'test-source');

          const stored = controller.state.assetsInfo[
            MOCK_ASSET_ID
          ] as FungibleAssetMetadata;
          expect(stored.symbol).toBe('NEW');
          expect(stored.name).toBe('New Token');
          expect(stored.decimals).toBe(8);
        },
      );
    });

    it('uses API metadata when there is no pre-existing state for the asset', async () => {
      await withController(async ({ controller }) => {
        const apiResponse: DataResponse = {
          assetsInfo: {
            [MOCK_ASSET_ID]: {
              type: 'erc20',
              symbol: '',
              name: '',
              decimals: 18,
            } as FungibleAssetMetadata,
          },
        };

        await controller.handleAssetsUpdate(apiResponse, 'test-source');

        const stored = controller.state.assetsInfo[
          MOCK_ASSET_ID
        ] as FungibleAssetMetadata;
        expect(stored.decimals).toBe(18);
        expect(stored.symbol).toBe('');
        expect(stored.name).toBe('');
      });
    });

    it('does not run token or price middleware when isBasicFunctionality is false', async () => {
      const tokenMiddlewareGetter = jest.spyOn(
        TokenDataSource.prototype,
        'assetsMiddleware',
        // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
        'get',
      ) as unknown as jest.SpyInstance;
      const priceMiddlewareGetter = jest.spyOn(
        PriceDataSource.prototype,
        'assetsMiddleware',
        // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
        'get',
      ) as unknown as jest.SpyInstance;

      const request: DataRequest = {
        accountsWithSupportedChains: [],
        chainIds: ['eip155:1'],
        dataTypes: ['balance', 'metadata', 'price'],
      };

      await withController(
        { isBasicFunctionality: () => false },
        async ({ controller }) => {
          tokenMiddlewareGetter.mockClear();
          priceMiddlewareGetter.mockClear();

          await controller.handleAssetsUpdate(
            {
              assetsBalance: {
                [MOCK_ACCOUNT_ID]: {
                  [MOCK_NATIVE_ASSET_ID]: { amount: '1' },
                },
              },
            },
            'RpcDataSource',
            request,
          );
        },
      );

      expect(tokenMiddlewareGetter).not.toHaveBeenCalled();
      expect(priceMiddlewareGetter).not.toHaveBeenCalled();

      tokenMiddlewareGetter.mockRestore();
      priceMiddlewareGetter.mockRestore();
    });
  });

  describe('getAssetsBalance', () => {
    it('returns balance data for accounts', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const balances = await controller.getAssetsBalance(accounts);

        expect(balances[MOCK_ACCOUNT_ID]).toStrictEqual({});
      });
    });
  });

  describe('getAssetsPrice', () => {
    it('returns price data for assets', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const prices = await controller.getAssetsPrice(accounts);

        expect(prices).toStrictEqual({});
      });
    });
  });

  describe('getExchangeRatesForBridge', () => {
    it('calls formatExchangeRatesForBridge with state and network data', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsPrice: {
          [MOCK_NATIVE_ASSET_ID]: {
            assetPriceType: 'fungible',
            price: 2000,
            usdPrice: 2000,
            lastUpdated: 1_700_000_000_000,
          },
        },
        selectedCurrency: 'eur',
      };

      await withController({ state: initialState }, ({ controller }) => {
        formatExchangeRatesForBridgeMock.mockClear();

        controller.getExchangeRatesForBridge();

        expect(formatExchangeRatesForBridgeMock).toHaveBeenCalledTimes(1);
        expect(formatExchangeRatesForBridgeMock).toHaveBeenCalledWith({
          assetsPrice: initialState.assetsPrice,
          selectedCurrency: 'eur',
          nativeAssetIdentifiers: {
            'eip155:1': 'eip155:1/slip44:60',
          },
          networkConfigurationsByChainId: {},
        });
      });
    });
  });

  describe('handleActiveChainsUpdate', () => {
    it('calls getAssets with added enabled chains when chains are added', async () => {
      await withController(async ({ controller }) => {
        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

        expect(getAssetsSpy).toHaveBeenCalledTimes(1);
        expect(getAssetsSpy).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            chainIds: ['eip155:1'],
            forceUpdate: true,
            updateMode: 'merge',
          }),
        );
      });
    });

    it('does not call getAssets when no chains are added', async () => {
      await withController(async ({ controller }) => {
        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', [], []);
        onActiveChainsUpdated('TestDataSource', ['eip155:1'], ['eip155:1']);

        expect(getAssetsSpy).not.toHaveBeenCalled();
      });
    });

    it('does not call getAssets when only chains are removed', async () => {
      await withController(async ({ controller }) => {
        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', [], ['eip155:1']);

        expect(getAssetsSpy).not.toHaveBeenCalled();
      });
    });

    it('does nothing when controller is disabled', async () => {
      await withController(
        {
          controllerOptions: { isEnabled: (): boolean => false },
        },
        async ({ controller }) => {
          const getAssetsSpy = jest.spyOn(controller, 'getAssets');
          const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();

          onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

          expect(getAssetsSpy).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('handleAssetsUpdate - state updates', () => {
    it('updates state with balance data', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1000000' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '1000000' });
      });
    });

    it('updates state with metadata', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsInfo: {
              [MOCK_ASSET_ID]: {
                type: 'erc20',
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 6,
              },
            },
          },
          'TestSource',
        );

        expect(controller.state.assetsInfo[MOCK_ASSET_ID]).toStrictEqual({
          type: 'erc20',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        });
      });
    });

    it('normalizes asset IDs in response', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID_LOWERCASE]: { amount: '1000000' },
              },
            },
          },
          'TestSource',
        );

        // Should be stored with checksummed address
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '1000000' });
      });
    });

    it('handles empty response', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate({}, 'TestSource');

        expect(controller.state.assetsBalance).toStrictEqual({});
      });
    });

    it('adds default 0 balance for native tokens when missing from response', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1000000' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '1000000' });
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
            MOCK_NATIVE_ASSET_ID
          ],
        ).toStrictEqual({ amount: '0' });
      });
    });

    it('does not add default native balance for chains without a registered identifier', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1' },
              },
            },
          },
          'TestSource',
        );

        const accountBalances =
          controller.state.assetsBalance[MOCK_ACCOUNT_ID] ?? {};
        const nativeIds = Object.keys(accountBalances).filter((id) =>
          id.includes('/slip44:'),
        );
        expect(nativeIds).toStrictEqual([MOCK_NATIVE_ASSET_ID]);
      });
    });

    it('preserves existing balances when merge update adds new chain data', async () => {
      const polygonNative = 'eip155:137/slip44:966' as Caip19AssetId;
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1' },
            [MOCK_NATIVE_ASSET_ID]: { amount: '0.5' },
          },
        },
      };

      await withController({ state: initialState }, async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            updateMode: 'merge',
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [polygonNative]: { amount: '10' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '1' });
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
            MOCK_NATIVE_ASSET_ID
          ],
        ).toStrictEqual({ amount: '0.5' });
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[polygonNative],
        ).toStrictEqual({ amount: '10' });
      });
    });

    it('replaces state when full update has authoritative data', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1' },
            [MOCK_NATIVE_ASSET_ID]: { amount: '0.5' },
          },
        },
      };

      await withController({ state: initialState }, async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            updateMode: 'full',
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_NATIVE_ASSET_ID]: { amount: '2' },
              },
            },
          },
          'TestSource',
        );

        // Full update is authoritative — the ERC20 that wasn't in the response is removed
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toBeUndefined();
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
            MOCK_NATIVE_ASSET_ID
          ],
        ).toStrictEqual({ amount: '2' });
      });
    });

    it('updates state with price data', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsPrice: {
              [MOCK_ASSET_ID]: {
                assetPriceType: 'fungible',
                price: 1.0,
                usdPrice: 1.0,
                pricePercentChange1d: 0.5,
                lastUpdated: Date.now(),
              },
            },
          },
          'TestSource',
        );

        expect(controller.state.assetsPrice[MOCK_ASSET_ID]).toBeDefined();
        expect(
          (controller.state.assetsPrice[MOCK_ASSET_ID] as { price: number })
            .price,
        ).toBe(1.0);
      });
    });
  });

  describe('setSelectedCurrency', () => {
    it('updates selectedCurrency in state', async () => {
      await withController(({ controller }) => {
        expect(controller.state.selectedCurrency).toBe('usd');

        controller.setSelectedCurrency('eur');
        expect(controller.state.selectedCurrency).toBe('eur');

        controller.setSelectedCurrency('gbp');
        expect(controller.state.selectedCurrency).toBe('gbp');
      });
    });

    it('returns early when new currency is same as current', async () => {
      await withController(({ controller }) => {
        expect(controller.state.selectedCurrency).toBe('usd');

        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        controller.setSelectedCurrency('usd');

        expect(controller.state.selectedCurrency).toBe('usd');
        expect(getAssetsSpy).not.toHaveBeenCalled();

        getAssetsSpy.mockRestore();
      });
    });

    it('calls getAssets with forceUpdate, price dataType, and assetsForPriceUpdate to refresh prices', async () => {
      const mockAssetId2 =
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1000000' },
            [mockAssetId2]: { amount: '2000000' },
          },
        },
      };

      await withController({ state: initialState }, ({ controller }) => {
        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        controller.setSelectedCurrency('eur');

        expect(getAssetsSpy).toHaveBeenCalledWith(expect.any(Array), {
          forceUpdate: true,
          dataTypes: ['price'],
          assetsForPriceUpdate: [MOCK_ASSET_ID, mockAssetId2],
        });

        getAssetsSpy.mockRestore();
      });
    });

    it('does not call getAssets when isBasicFunctionality is false', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1' },
          },
        },
      };

      await withController(
        { state: initialState, isBasicFunctionality: () => false },
        ({ controller }) => {
          const getAssetsSpy = jest.spyOn(controller, 'getAssets');

          controller.setSelectedCurrency('eur');

          expect(controller.state.selectedCurrency).toBe('eur');
          expect(getAssetsSpy).not.toHaveBeenCalled();

          getAssetsSpy.mockRestore();
        },
      );
    });
  });

  describe('events', () => {
    it('publishes balanceChanged event when balance updates', async () => {
      await withController(async ({ controller, messenger }) => {
        const balanceChangedHandler = jest.fn();
        messenger.subscribe(
          'AssetsController:balanceChanged',
          balanceChangedHandler,
        );

        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1000000' },
              },
            },
          },
          'TestSource',
        );

        expect(balanceChangedHandler).toHaveBeenCalledWith({
          accountId: MOCK_ACCOUNT_ID,
          assetId: MOCK_ASSET_ID,
          previousAmount: '0',
          newAmount: '1000000',
        });
      });
    });

    it('does not publish balanceChanged when balance unchanged', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1000000' },
          },
        },
      };

      await withController(
        { state: initialState },
        async ({ controller, messenger }) => {
          const balanceChangedHandler = jest.fn();
          messenger.subscribe(
            'AssetsController:balanceChanged',
            balanceChangedHandler,
          );

          await controller.handleAssetsUpdate(
            {
              assetsBalance: {
                [MOCK_ACCOUNT_ID]: {
                  [MOCK_ASSET_ID]: { amount: '1000000' },
                },
              },
            },
            'TestSource',
          );

          expect(balanceChangedHandler).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('keyring lifecycle', () => {
    it('starts tracking on keyring unlock', async () => {
      await withController(async ({ messenger }) => {
        messenger.publish('KeyringController:unlock');
        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

    it('stops tracking on keyring lock', async () => {
      await withController(async ({ messenger }) => {
        messenger.publish('KeyringController:unlock');
        await new Promise(process.nextTick);

        messenger.publish('KeyringController:lock');
        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

    it('invokes trace with first init fetch trace request on unlock', async () => {
      const traceMock = jest
        .fn()
        .mockImplementation(
          async (_request: TraceRequest, fn?: (context?: unknown) => unknown) =>
            fn?.(),
        );
      const trace = traceMock as unknown as TraceCallback;

      await withController(
        {
          clientControllerState: { isUiOpen: true },
          controllerOptions: { trace },
        },
        async ({ messenger }) => {
          // UI must be open and keyring unlocked for asset tracking to run
          (
            messenger as unknown as {
              publish: (topic: string, payload?: unknown) => void;
            }
          ).publish('ClientController:stateChange', { isUiOpen: true });
          messenger.publish('KeyringController:unlock');

          // Allow #start() -> getAssets() to resolve so the callback runs
          await new Promise((resolve) => setTimeout(resolve, 100));

          const firstInitFetchCalls = traceMock.mock.calls.filter(
            (call) =>
              (call[0] as TraceRequest).name ===
              'AssetsControllerFirstInitFetch',
          );
          expect(firstInitFetchCalls).toHaveLength(1);
          const [request] = firstInitFetchCalls[0];
          expect(request).toMatchObject({
            name: 'AssetsControllerFirstInitFetch',
            data: expect.objectContaining({
              duration_ms: expect.any(Number),
              chain_ids: expect.any(String),
            }),
            tags: { controller: 'AssetsController' },
          });
          const {
            duration_ms: durationMs,
            chain_ids: chainIds,
            ...durationByDataSource
          } = request.data ?? {};
          expect(durationMs).toBeGreaterThanOrEqual(0);
          expect(typeof chainIds).toBe('string');
          expect(typeof durationByDataSource).toBe('object');
        },
      );
    });

    it('invokes trace only once per session until lock', async () => {
      const traceMock = jest
        .fn()
        .mockImplementation(
          async (_request: TraceRequest, fn?: (context?: unknown) => unknown) =>
            fn?.(),
        );
      const trace = traceMock as unknown as TraceCallback;

      await withController(
        {
          clientControllerState: { isUiOpen: true },
          controllerOptions: { trace },
        },
        async ({ messenger }) => {
          // UI must be open and keyring unlocked for asset tracking to run
          (
            messenger as unknown as {
              publish: (topic: string, payload?: unknown) => void;
            }
          ).publish('ClientController:stateChange', { isUiOpen: true });
          messenger.publish('KeyringController:unlock');
          await new Promise((resolve) => setTimeout(resolve, 100));

          messenger.publish('KeyringController:unlock');
          await new Promise((resolve) => setTimeout(resolve, 100));

          const firstInitFetchCalls = traceMock.mock.calls.filter(
            (call) =>
              (call[0] as TraceRequest).name ===
              'AssetsControllerFirstInitFetch',
          );
          expect(firstInitFetchCalls).toHaveLength(1);
        },
      );
    });
  });

  describe('subscribeAssetsPrice', () => {
    it('completes without error when data sources are not initialized', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        expect(() => {
          controller.subscribeAssetsPrice(accounts, ['eip155:1']);
        }).not.toThrow();
      });
    });
  });

  describe('unsubscribeAssetsPrice', () => {
    it('completes without error when no subscription exists', async () => {
      await withController(async ({ controller }) => {
        controller.subscribeAssetsPrice(
          [createMockInternalAccount()],
          ['eip155:1'],
        );
        expect(() => controller.unsubscribeAssetsPrice()).not.toThrow();
      });
    });

    it('does nothing when no subscription exists', async () => {
      await withController(async ({ controller }) => {
        // Should not throw when no subscription exists
        controller.unsubscribeAssetsPrice();

        expect(controller.state).toBeDefined();
      });
    });
  });

  describe('destroy', () => {
    it('cleans up resources', async () => {
      await withController(async ({ controller }) => {
        controller.destroy();

        // Should not throw - just verify it completes
        expect(true).toBe(true);
      });
    });

    it('unregisters action handlers', async () => {
      await withController(async ({ controller, messenger }) => {
        controller.destroy();

        // Action handlers should be unregistered
        expect(() => {
          // The handler is unregistered, so calling it should throw
          (messenger.call as CallableFunction)(
            'AssetsController:getAssets',
            createMockInternalAccount(),
          );
        }).toThrow(
          'A handler for AssetsController:getAssets has not been registered',
        );
      });
    });
  });

  describe('network changes', () => {
    it('handles enabled networks change', async () => {
      await withController(async ({ messenger }) => {
        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': true,
              },
            },
            nativeAssetIdentifiers: {
              'eip155:1': MOCK_NATIVE_ASSET_ID,
              'eip155:137': 'eip155:137/slip44:966',
            },
          },
          [],
        );

        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

    it('handles network being disabled', async () => {
      await withController(async ({ messenger }) => {
        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': true,
              },
            },
            nativeAssetIdentifiers: {
              'eip155:1': MOCK_NATIVE_ASSET_ID,
              'eip155:137': 'eip155:137/slip44:966',
            },
          },
          [],
        );

        await new Promise(process.nextTick);

        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': false,
              },
            },
            nativeAssetIdentifiers: {
              'eip155:1': MOCK_NATIVE_ASSET_ID,
            },
          },
          [],
        );

        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });
  });

  describe('account group changes', () => {
    it('handles account group change', async () => {
      await withController(async ({ messenger }) => {
        (messenger.publish as CallableFunction)(
          'AccountTreeController:selectedAccountGroupChange',
          undefined,
        );

        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });
  });

  describe('account tree state change', () => {
    it('triggers start when tree initializes after unlock with empty accounts', async () => {
      const getAccountsMock = jest.fn().mockReturnValue([]);

      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });
      messenger.registerActionHandler(
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
        getAccountsMock,
      );
      messenger.registerActionHandler(
        'NetworkEnablementController:getState',
        () => ({
          enabledNetworkMap: { eip155: { '1': true } },
          nativeAssetIdentifiers: {
            'eip155:1':
              'eip155:1/slip44:60' as `${string}:${string}/slip44:${number}`,
          },
        }),
      );
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getState', () => ({
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      }));
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getNetworkClientById', () => ({
        provider: {},
      }));
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('ClientController:getState', () => ({
        isUiOpen: true,
      }));

      const controller = new AssetsController({
        messenger: messenger as unknown as AssetsControllerMessenger,
        queryApiClient: createMockQueryApiClient(),
        subscribeToBasicFunctionalityChange: (): void => {
          /* no-op */
        },
      });

      const getAssetsSpy = jest.spyOn(controller, 'getAssets');

      // Step 1: UI open + unlock — accounts empty, #start() is a no-op
      (
        messenger as unknown as {
          publish: (topic: string, payload?: unknown) => void;
        }
      ).publish('ClientController:stateChange', { isUiOpen: true });
      messenger.publish('KeyringController:unlock');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getAssetsSpy).not.toHaveBeenCalled();

      // Step 2: AccountTreeController.init() completes — accounts now available
      getAccountsMock.mockReturnValue([createMockInternalAccount()]);
      (messenger.publish as CallableFunction)(
        'AccountTreeController:stateChange',
        {},
        [],
      );
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getAssetsSpy).toHaveBeenCalledTimes(1);
      expect(getAssetsSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ id: MOCK_ACCOUNT_ID })],
        expect.objectContaining({ forceUpdate: true }),
      );
    });
  });
});
