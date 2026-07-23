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
import type { NetworkState } from '@metamask/network-controller';

import {
  AssetsController,
  getDefaultAssetsControllerState,
} from './AssetsController';
import type {
  AssetsControllerMessenger,
  AssetsControllerState,
} from './AssetsController';
import type { AccountsApiDataSourceConfig } from './data-sources/AccountsApiDataSource';
import type { PriceDataSourceConfig } from './data-sources/PriceDataSource';
import { PriceDataSource } from './data-sources/PriceDataSource';
import { RpcDataSource } from './data-sources/RpcDataSource';
import { TokenDataSource } from './data-sources/TokenDataSource';
import { buildDefaultAssetsInfo } from './defaults';
import type { Assets3346MigrationState } from './migrations/healAssetsInfoMetadata';
import type {
  Caip19AssetId,
  AccountId,
  DataRequest,
  DataResponse,
  FungibleAssetMetadata,
} from './types';
import { formatExchangeRatesForBridge, normalizeAssetId } from './utils';

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
  const cache = new Map<string, unknown>();
  return {
    fetch: jest.fn(),
    getCachedData: jest.fn((key: string[]) => cache.get(JSON.stringify(key))),
    setCachedData: jest.fn((key: string[], data: unknown) =>
      cache.set(JSON.stringify(key), data),
    ),
    queryClient: {
      fetchQuery: jest.fn(
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
  } as unknown as ApiPlatformClient;
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
  queryApiClient?: ApiPlatformClient;
  /**
   * When set, registers ClientController:getState so the controller sees this UI state.
   * Required for tests that rely on asset tracking running (e.g. trace on unlock).
   */
  clientControllerState?: { isUiOpen: boolean };
  /**
   * When set, registers RemoteFeatureFlagController:getState so the controller can
   * read feature flags (e.g. `assetsAccountsApiV6` gating the balances endpoint).
   */
  remoteFeatureFlags?: Record<string, unknown>;
  /** Extra options passed to AssetsController constructor (e.g. trace). */
  controllerOptions?: Partial<{
    trace: TraceCallback;
    priceDataSourceConfig: PriceDataSourceConfig;
    accountsApiDataSourceConfig: AccountsApiDataSourceConfig;
    isEnabled: () => boolean;
    captureException: (error: Error) => void;
    tempMigrateAssetsInfoMetadataAssets3346: () => Assets3346MigrationState;
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
      remoteFeatureFlags,
      queryApiClient = createMockQueryApiClient(),
      controllerOptions = {},
    },
    fn,
  ]: [WithControllerOptions, WithControllerCallback<ReturnValue>] =
    args.length === 2 ? args : [{}, args[0]];

  const {
    priceDataSourceConfig: incomingPriceDataSourceConfig,
    ...restControllerOptions
  } = controllerOptions;

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

  if (remoteFeatureFlags !== undefined) {
    (
      messenger as {
        registerActionHandler: (a: string, h: () => unknown) => void;
      }
    ).registerActionHandler('RemoteFeatureFlagController:getState', () => ({
      remoteFeatureFlags,
      cacheTimestamp: 0,
    }));
  }

  const controller = new AssetsController({
    messenger: messenger as unknown as AssetsControllerMessenger,
    state,
    queryApiClient,
    isBasicFunctionality,
    subscribeToBasicFunctionalityChange: (): void => {
      /* no-op for tests */
    },
    ...restControllerOptions,
    priceDataSourceConfig: {
      ...incomingPriceDataSourceConfig,
    },
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
    it('returns default state with empty balance/price maps and pre-seeded assetsInfo', () => {
      const defaultState = getDefaultAssetsControllerState();

      expect(defaultState).toStrictEqual({
        assetsInfo: buildDefaultAssetsInfo(),
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
        selectedCurrency: 'usd',
      });
    });

    it('pre-seeds assetsInfo with EIP-55 checksummed CAIP-19 keys', () => {
      // Regression: MUSD_ADDRESS was previously all-lowercase, so
      // buildDefaultAssetsInfo() produced lowercase CAIP-19 keys while data
      // sources (which call normalizeAssetId) wrote checksummed keys.
      // After the first balance poll both keys existed in assetsInfo.
      const defaultState = getDefaultAssetsControllerState();
      const assetIds = Object.keys(defaultState.assetsInfo);
      expect(assetIds.length).toBeGreaterThan(0);
      const erc20Ids = assetIds.filter((id) => id.includes('/erc20:'));
      expect(erc20Ids.length).toBeGreaterThan(0);
      for (const id of erc20Ids) {
        expect(id).toBe(normalizeAssetId(id as Caip19AssetId));
      }
    });
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          assetsInfo: buildDefaultAssetsInfo(),
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

    describe('temporary assetsInfo metadata healing (tempMigrateAssetsInfoMetadataAssets3346)', () => {
      const HEALED_ASSET_ID =
        'eip155:14/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const LEGACY_ACCOUNT_ADDRESS =
        '0x1234567890123456789012345678901234567890';
      const legacyState: Assets3346MigrationState = {
        TokensController: {
          allTokens: {
            // Flare (0xe / 14) is not covered by the Accounts API.
            '0xe': {
              [LEGACY_ACCOUNT_ADDRESS]: [
                {
                  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                  symbol: 'TST',
                  name: 'Test Token',
                  decimals: 18,
                },
              ],
            },
          },
        },
        AccountsController: {
          internalAccounts: {
            accounts: {
              [MOCK_ACCOUNT_ID]: { address: LEGACY_ACCOUNT_ADDRESS },
            },
          },
        },
      };

      it('heals wiped niche-chain token metadata from legacy state on construction', async () => {
        await withController(
          {
            controllerOptions: {
              tempMigrateAssetsInfoMetadataAssets3346: () => legacyState,
            },
          },
          ({ controller }) => {
            expect(controller.state.assetsInfo[HEALED_ASSET_ID]).toStrictEqual({
              type: 'erc20',
              symbol: 'TST',
              name: 'Test Token',
              decimals: 18,
            });
            expect(
              controller.state.customAssets[MOCK_ACCOUNT_ID],
            ).toStrictEqual([HEALED_ASSET_ID]);
          },
        );
      });

      it('does not overwrite existing assetsInfo metadata', async () => {
        const existingMetadata: FungibleAssetMetadata = {
          type: 'erc20',
          symbol: 'EXISTING',
          name: 'Existing Token',
          decimals: 6,
        };

        await withController(
          {
            state: {
              assetsInfo: { [HEALED_ASSET_ID]: existingMetadata },
            },
            controllerOptions: {
              tempMigrateAssetsInfoMetadataAssets3346: () => legacyState,
            },
          },
          ({ controller }) => {
            expect(controller.state.assetsInfo[HEALED_ASSET_ID]).toStrictEqual(
              existingMetadata,
            );
          },
        );
      });

      it('leaves state untouched when the legacy state has nothing restorable', async () => {
        await withController(
          {
            controllerOptions: {
              tempMigrateAssetsInfoMetadataAssets3346: () => ({}),
            },
          },
          ({ controller }) => {
            expect(controller.state).toStrictEqual(
              getDefaultAssetsControllerState(),
            );
          },
        );
      });

      it('reports getter errors via captureException without breaking construction', async () => {
        const captureException = jest.fn();

        await withController(
          {
            controllerOptions: {
              captureException,
              tempMigrateAssetsInfoMetadataAssets3346: () => {
                throw new Error('legacy state unavailable');
              },
            },
          },
          ({ controller }) => {
            expect(controller.state).toStrictEqual(
              getDefaultAssetsControllerState(),
            );
            expect(captureException).toHaveBeenCalledWith(
              expect.objectContaining({
                message: expect.stringContaining('legacy state unavailable'),
              }),
            );
          },
        );
      });
    });

    it('initializes normally when isEnabled returns true', async () => {
      await withController(({ controller, messenger }) => {
        // Controller should have default state
        expect(controller.state).toStrictEqual({
          assetPreferences: {},
          assetsInfo: buildDefaultAssetsInfo(),
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

      messenger.registerActionHandler(
        'NetworkEnablementController:getState',
        () => ({
          enabledNetworkMap: {},
          nativeAssetIdentifiers: {},
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

      expect(
        () =>
          new AssetsController({
            messenger: messenger as unknown as AssetsControllerMessenger,
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

      messenger.registerActionHandler(
        'NetworkEnablementController:getState',
        () => ({
          enabledNetworkMap: {},
          nativeAssetIdentifiers: {},
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

      expect(
        () =>
          new AssetsController({
            messenger: messenger as unknown as AssetsControllerMessenger,
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

    it('seeds assetsBalance with a zero amount for a newly added custom asset', async () => {
      await withController(async ({ controller }) => {
        await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '0' });
      });
    });

    it('does not overwrite an existing balance when re-adding a custom asset', async () => {
      await withController(
        {
          state: {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1000000' },
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

          expect(
            controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
          ).toStrictEqual({ amount: '1000000' });
        },
      );
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

  describe('getAsset', () => {
    const metadata = {
      type: 'erc20' as const,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    };

    it('returns the combined asset with computed fiatValue', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '100' } },
        },
        assetsPrice: { [MOCK_ASSET_ID]: { price: 2, lastUpdated: 123 } },
      };

      await withController({ state: initialState }, ({ controller }) => {
        const asset = controller.getAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(asset).toStrictEqual({
          id: MOCK_ASSET_ID,
          chainId: 'eip155:1',
          balance: { amount: '100' },
          metadata,
          price: { price: 2, lastUpdated: 123 },
          fiatValue: 200,
        });
      });
    });

    it('normalizes a lowercase EVM asset ID before lookup', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '1' } },
        },
        assetsPrice: { [MOCK_ASSET_ID]: { price: 1, lastUpdated: 1 } },
      };

      await withController({ state: initialState }, ({ controller }) => {
        const asset = controller.getAsset(
          MOCK_ACCOUNT_ID,
          MOCK_ASSET_ID_LOWERCASE,
        );

        expect(asset?.id).toBe(MOCK_ASSET_ID);
      });
    });

    it('returns undefined when the balance is missing', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
      };

      await withController({ state: initialState }, ({ controller }) => {
        expect(
          controller.getAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
        ).toBeUndefined();
      });
    });

    it('returns undefined when the metadata is missing', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '100' } },
        },
      };

      await withController({ state: initialState }, ({ controller }) => {
        expect(
          controller.getAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
        ).toBeUndefined();
      });
    });

    it('falls back to a zero price and fiatValue when the price is missing', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '100' } },
        },
      };

      await withController({ state: initialState }, ({ controller }) => {
        const asset = controller.getAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

        expect(asset?.price).toStrictEqual({ price: 0, lastUpdated: 0 });
        expect(asset?.fiatValue).toBe(0);
      });
    });

    it('returns undefined for a hidden asset', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '100' } },
        },
        assetPreferences: { [MOCK_ASSET_ID]: { hidden: true } },
      };

      await withController({ state: initialState }, ({ controller }) => {
        expect(
          controller.getAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
        ).toBeUndefined();
      });
    });

    it('throws when accountId is empty', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.getAsset('' as AccountId, MOCK_ASSET_ID),
        ).toThrow('accountId must be a non-empty string');
      });
    });

    it('throws when assetId is not a valid CAIP-19 asset ID', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.getAsset(
            MOCK_ACCOUNT_ID,
            'not-a-caip-19' as Caip19AssetId,
          ),
        ).toThrow('invalid CAIP-19 assetId');
      });
    });

    it('is exposed as the AssetsController:getAsset messenger action', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: { [MOCK_ASSET_ID]: metadata },
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: { [MOCK_ASSET_ID]: { amount: '100' } },
        },
        assetsPrice: { [MOCK_ASSET_ID]: { price: 2, lastUpdated: 123 } },
      };

      await withController({ state: initialState }, ({ messenger }) => {
        const asset = messenger.call(
          'AssetsController:getAsset',
          MOCK_ACCOUNT_ID,
          MOCK_ASSET_ID,
        );

        expect(asset?.fiatValue).toBe(200);
      });
    });
  });

  describe('getAssets', () => {
    it('returns empty object when no balances exist', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const assets = await controller.getAssets(accounts);

        // `#getAssetsFromState` returns null-prototype objects (prototype-pollution
        // hardening), so assert emptiness via keys to avoid a prototype mismatch.
        expect(Object.keys(assets[MOCK_ACCOUNT_ID])).toStrictEqual([]);
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

    // Endpoint selection from the flag is unit-tested in AccountsApiDataSource;
    // this asserts the controller wires its messenger through so the
    // `assetsAccountsApiV6` flag drives endpoint selection end-to-end.
    it('routes to the Accounts API v6 endpoint when the assetsAccountsApiV6 remote flag is enabled', async () => {
      const fetchV6MultiAccountBalances = jest.fn().mockResolvedValue({
        accounts: [],
        unprocessedNetworks: [],
        unprocessedIncludeAssetIds: [],
      });
      const fetchV5MultiAccountBalances = jest.fn().mockResolvedValue({
        balances: [],
        unprocessedNetworks: [],
      });

      const queryApiClient = {
        ...createMockQueryApiClient(),
        accounts: {
          fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
            fullSupport: [1],
            partialSupport: [],
          }),
          fetchV6MultiAccountBalances,
          fetchV5MultiAccountBalances,
        },
      } as unknown as ApiPlatformClient;

      await withController(
        {
          queryApiClient,
          remoteFeatureFlags: { assetsAccountsApiV6: { value: true } },
        },
        async ({ controller }) => {
          await flushPromises();

          await controller.getAssets([createMockInternalAccount()], {
            chainIds: ['eip155:1'],
            forceUpdate: true,
          });

          expect(fetchV6MultiAccountBalances).toHaveBeenCalled();
          expect(fetchV5MultiAccountBalances).not.toHaveBeenCalled();
        },
      );
    });

    it('forwards user-pinned custom assets to the Accounts API v6 endpoint as includeAssetIds', async () => {
      const fetchV6MultiAccountBalances = jest.fn().mockResolvedValue({
        accounts: [],
        unprocessedNetworks: [],
        unprocessedIncludeAssetIds: [],
      });

      const queryApiClient = {
        ...createMockQueryApiClient(),
        accounts: {
          fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
            fullSupport: [1],
            partialSupport: [],
          }),
          fetchV6MultiAccountBalances,
          fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
            balances: [],
            unprocessedNetworks: [],
          }),
        },
      } as unknown as ApiPlatformClient;

      const customToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

      await withController(
        {
          queryApiClient,
          remoteFeatureFlags: { assetsAccountsApiV6: { value: true } },
        },
        async ({ controller }) => {
          await flushPromises();

          await controller.addCustomAsset(MOCK_ACCOUNT_ID, customToken);

          await controller.getAssets([createMockInternalAccount()], {
            chainIds: ['eip155:1'],
            forceUpdate: true,
          });

          expect(fetchV6MultiAccountBalances).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
              includeAssetIds: expect.arrayContaining([customToken]),
            }),
            expect.anything(),
          );
        },
      );
    });

    it('forwards user-hidden assets to the Accounts API v6 endpoint as excludeAssetIds', async () => {
      const fetchV6MultiAccountBalances = jest.fn().mockResolvedValue({
        accounts: [],
        unprocessedNetworks: [],
        unprocessedIncludeAssetIds: [],
      });

      const queryApiClient = {
        ...createMockQueryApiClient(),
        accounts: {
          fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
            fullSupport: [1],
            partialSupport: [],
          }),
          fetchV6MultiAccountBalances,
          fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
            balances: [],
            unprocessedNetworks: [],
          }),
        },
      } as unknown as ApiPlatformClient;

      const hiddenToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

      await withController(
        {
          queryApiClient,
          remoteFeatureFlags: { assetsAccountsApiV6: { value: true } },
        },
        async ({ controller }) => {
          await flushPromises();

          controller.hideAsset(hiddenToken);

          await controller.getAssets([createMockInternalAccount()], {
            chainIds: ['eip155:1'],
            forceUpdate: true,
          });

          expect(fetchV6MultiAccountBalances).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
              excludeAssetIds: expect.arrayContaining([hiddenToken]),
            }),
            expect.anything(),
          );
        },
      );
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

            // Background pipelines overlay balances without wiping fast-pipeline results.
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

      it('routes chains carrying unprocessed pinned assets (unprocessedCustomAssets) to the slow-pipeline RPC fetch', async () => {
        const customToken =
          'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

        const fetchV6MultiAccountBalances = jest.fn().mockResolvedValue({
          accounts: [],
          unprocessedNetworks: [],
          unprocessedIncludeAssetIds: [customToken],
        });

        const queryApiClient = {
          ...createMockQueryApiClient(),
          accounts: {
            fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
              fullSupport: [1],
              partialSupport: [],
            }),
            fetchV6MultiAccountBalances,
            fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
              balances: [],
              unprocessedNetworks: [],
            }),
          },
        } as unknown as ApiPlatformClient;

        const rpcRequestChainIds: ChainId[][] = [];
        const rpcMiddleware = jest.fn(async (ctx, next) => {
          rpcRequestChainIds.push(ctx.request.chainIds);
          return next(ctx);
        });
        const rpcMiddlewareGetter = jest
          .spyOn(
            RpcDataSource.prototype,
            'assetsMiddleware',
            // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
            'get',
          )
          .mockReturnValue(rpcMiddleware) as unknown as jest.SpyInstance;

        await withController(
          {
            queryApiClient,
            remoteFeatureFlags: { assetsAccountsApiV6: { value: true } },
          },
          async ({ controller }) => {
            await flushPromises();

            await controller.addCustomAsset(MOCK_ACCOUNT_ID, customToken);

            await controller.getAssets([createMockInternalAccount()], {
              chainIds: ['eip155:1'],
              forceUpdate: true,
            });

            // Slow pipeline is fire-and-forget; let it run.
            await flushPromises();
          },
        );

        // The chain of the unresolved pin (eip155:1) — a chain AccountsApi
        // handled and did NOT flag as errored — is still routed to RPC in the
        // slow pipeline so the pin gets fetched.
        expect(rpcMiddleware).toHaveBeenCalled();
        expect(
          rpcRequestChainIds.some((chains) => chains.includes('eip155:1')),
        ).toBe(true);

        rpcMiddlewareGetter.mockRestore();
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
            updateMode: 'merge',
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
            updateMode: 'merge',
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

    it('falls back to RPC for chains a subscription update flagged as errored (e.g. unprocessedNetworks)', async () => {
      const rpcMiddlewareGetter = jest.spyOn(
        RpcDataSource.prototype,
        'assetsMiddleware',
        // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
        'get',
      ) as unknown as jest.SpyInstance;

      const request: DataRequest = {
        accountsWithSupportedChains: [],
        chainIds: ['eip155:1'],
        dataTypes: ['balance'],
      };

      await withController(async ({ controller }) => {
        rpcMiddlewareGetter.mockClear();

        await controller.handleAssetsUpdate(
          {
            assetsBalance: {},
            errors: { 'eip155:1': 'Unprocessed networks' },
          },
          'AccountsApiDataSource',
          request,
        );
      });

      // The RpcFallbackMiddleware pulls the RPC data source middleware only when
      // there are errored chains to recover.
      expect(rpcMiddlewareGetter).toHaveBeenCalled();

      rpcMiddlewareGetter.mockRestore();
    });

    it('falls back to RPC for pinned assets a subscription update reported as unprocessed (unprocessedCustomAssets)', async () => {
      const rpcMiddlewareGetter = jest.spyOn(
        RpcDataSource.prototype,
        'assetsMiddleware',
        // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
        'get',
      ) as unknown as jest.SpyInstance;

      const customToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

      const request: DataRequest = {
        accountsWithSupportedChains: [],
        chainIds: ['eip155:1'],
        dataTypes: ['balance'],
        customAssets: [customToken],
      };

      await withController(async ({ controller }) => {
        rpcMiddlewareGetter.mockClear();

        await controller.handleAssetsUpdate(
          {
            assetsBalance: {},
            unprocessedCustomAssets: [customToken],
          },
          'AccountsApiDataSource',
          request,
        );
      });

      // The asset-axis signal also pulls the RPC data source middleware for an
      // asset-scoped recovery.
      expect(rpcMiddlewareGetter).toHaveBeenCalled();

      rpcMiddlewareGetter.mockRestore();
    });

    it('does not run the RPC fallback when a subscription update has no errored chains', async () => {
      const rpcMiddlewareGetter = jest.spyOn(
        RpcDataSource.prototype,
        'assetsMiddleware',
        // @ts-expect-error -- Jest supports `get` for accessor spies; `Spyable` typings omit prototype getters.
        'get',
      ) as unknown as jest.SpyInstance;

      const request: DataRequest = {
        accountsWithSupportedChains: [],
        chainIds: ['eip155:1'],
        dataTypes: ['balance'],
      };

      await withController(async ({ controller }) => {
        rpcMiddlewareGetter.mockClear();

        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_NATIVE_ASSET_ID]: { amount: '1' },
              },
            },
          },
          'AccountsApiDataSource',
          request,
        );
      });

      expect(rpcMiddlewareGetter).not.toHaveBeenCalled();

      rpcMiddlewareGetter.mockRestore();
    });
  });

  describe('getAssetsBalance', () => {
    it('returns balance data for accounts', async () => {
      await withController(async ({ controller }) => {
        const accounts = [createMockInternalAccount()];
        const balances = await controller.getAssetsBalance(accounts);

        expect(Object.keys(balances[MOCK_ACCOUNT_ID])).toStrictEqual([]);
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
        assetsInfo: {},
        selectedCurrency: 'eur',
      };

      await withController({ state: initialState }, ({ controller }) => {
        formatExchangeRatesForBridgeMock.mockClear();

        controller.getExchangeRatesForBridge();

        expect(formatExchangeRatesForBridgeMock).toHaveBeenCalledTimes(1);
        expect(formatExchangeRatesForBridgeMock).toHaveBeenCalledWith({
          assetsInfo: initialState.assetsInfo,
          assetsPrice: initialState.assetsPrice,
          selectedCurrency: 'eur',
          nativeAssetIdentifiers: expect.objectContaining({
            'eip155:1': 'eip155:1/slip44:60',
          }),
          networkConfigurationsByChainId: {},
        });
      });
    });
  });

  describe('handleActiveChainsUpdate', () => {
    it('re-subscribes assets when chains are added', async () => {
      await withController(async ({ controller }) => {
        const subscribeSpy = jest.spyOn(controller, 'subscribeAssetsPrice');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

        expect(subscribeSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('does not fetch balances directly when chains are added', async () => {
      await withController(async ({ controller }) => {
        const getAssetsSpy = jest.spyOn(controller, 'getAssets');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

        expect(getAssetsSpy).not.toHaveBeenCalled();
      });
    });

    it('does not re-subscribe when no chains change', async () => {
      await withController(async ({ controller }) => {
        const subscribeSpy = jest.spyOn(controller, 'subscribeAssetsPrice');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', [], []);
        onActiveChainsUpdated('TestDataSource', ['eip155:1'], ['eip155:1']);

        expect(subscribeSpy).not.toHaveBeenCalled();
      });
    });

    it('re-subscribes assets when chains are removed', async () => {
      await withController(async ({ controller }) => {
        const subscribeSpy = jest.spyOn(controller, 'subscribeAssetsPrice');

        const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
        onActiveChainsUpdated('TestDataSource', [], ['eip155:1']);

        expect(subscribeSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('does nothing when controller is disabled', async () => {
      await withController(
        {
          controllerOptions: { isEnabled: (): boolean => false },
        },
        async ({ controller }) => {
          const subscribeSpy = jest.spyOn(controller, 'subscribeAssetsPrice');
          const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();

          onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

          expect(subscribeSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('re-evaluates isEnabled when active chains change', async () => {
      let enabled = true;

      await withController(
        {
          controllerOptions: { isEnabled: (): boolean => enabled },
        },
        async ({ controller }) => {
          const subscribeSpy = jest.spyOn(controller, 'subscribeAssetsPrice');
          enabled = false;

          const onActiveChainsUpdated = controller.getOnActiveChainsUpdated();
          onActiveChainsUpdated('TestDataSource', ['eip155:1'], []);

          expect(subscribeSpy).not.toHaveBeenCalled();
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

    it('reconciles a stale native type stored as erc20 when assetsInfo includes the asset', async () => {
      // Native (zero-address ERC-20) mis-stored as erc20 by an older version.
      const imxAssetId =
        'eip155:13371/erc20:0x0000000000000000000000000000000000000000' as Caip19AssetId;
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: {
          [imxAssetId]: {
            type: 'erc20',
            symbol: 'IMX',
            name: 'Immutable X',
            decimals: 18,
            image: 'https://example.com/imx.png',
          },
        },
      };

      await withController(
        { state: initialState, isBasicFunctionality: () => false },
        async ({ controller }) => {
          // Reconciliation occurs when assetsInfo includes the asset.
          await controller.handleAssetsUpdate(
            {
              assetsInfo: {
                [imxAssetId]: {
                  type: 'erc20',
                  symbol: 'IMX',
                  name: 'Immutable X',
                  decimals: 18,
                  image: 'https://example.com/imx.png',
                },
              },
            },
            'TestSource',
          );

          expect(controller.state.assetsInfo[imxAssetId]).toStrictEqual({
            type: 'native',
            symbol: 'IMX',
            name: 'Immutable X',
            decimals: 18,
            image: 'https://example.com/imx.png',
          });
        },
      );
    });

    it('reconciles a stale native type stored as erc20 when assetsBalance includes the asset', async () => {
      const imxAssetId =
        'eip155:13371/erc20:0x0000000000000000000000000000000000000000' as Caip19AssetId;
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: {
          [imxAssetId]: {
            type: 'erc20',
            symbol: 'IMX',
            name: 'Immutable X',
            decimals: 18,
            image: 'https://example.com/imx.png',
          },
        },
      };

      await withController(
        { state: initialState, isBasicFunctionality: () => false },
        async ({ controller }) => {
          await controller.handleAssetsUpdate(
            {
              assetsBalance: {
                [MOCK_ACCOUNT_ID]: {
                  [imxAssetId]: { amount: '1000000000000000000' },
                },
              },
            },
            'TestSource',
          );

          expect(controller.state.assetsInfo[imxAssetId]).toStrictEqual({
            type: 'native',
            symbol: 'IMX',
            name: 'Immutable X',
            decimals: 18,
            image: 'https://example.com/imx.png',
          });
        },
      );
    });

    it('leaves a genuine erc20 type untouched when assetsInfo includes it', async () => {
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

      await withController(
        { state: initialState, isBasicFunctionality: () => false },
        async ({ controller }) => {
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

          expect(controller.state.assetsInfo[MOCK_ASSET_ID]?.type).toBe(
            'erc20',
          );
        },
      );
    });

    it('reconciles type when assetsInfo response uses a non-checksummed asset ID', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsInfo: {
          [MOCK_ASSET_ID]: {
            type: 'native',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
      };

      await withController(
        { state: initialState, isBasicFunctionality: () => false },
        async ({ controller }) => {
          await controller.handleAssetsUpdate(
            {
              assetsInfo: {
                [MOCK_ASSET_ID_LOWERCASE]: {
                  type: 'native',
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              },
            },
            'TestSource',
          );

          expect(controller.state.assetsInfo[MOCK_ASSET_ID]?.type).toBe(
            'erc20',
          );
          expect(
            controller.state.assetsInfo[MOCK_ASSET_ID_LOWERCASE],
          ).toBeUndefined();
        },
      );
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

    it('coerces scientific-notation balance amounts using the asset decimals', async () => {
      // Prevents downstream BigInt() consumers (e.g. extension's
      // parseBalanceWithDecimals) from crashing on "1e-18"-style amounts that
      // arrive from snaps or APIs that stringified a JS Number. Decimals come
      // from the same-batch assetsInfo (18 here = 18 fractional digits).
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsInfo: {
              [MOCK_ASSET_ID]: {
                type: 'erc20',
                symbol: 'TEST',
                name: 'Test',
                decimals: 18,
              },
            },
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1e-18' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '0.000000000000000001' });
      });
    });

    it('still converts scientific notation to plain decimal when metadata is unknown', async () => {
      // No assetsInfo entry for this assetId, in state or in the response —
      // normalization keeps the amount at its natural precision (just defeats
      // exponent form). Truncating to integer here would silently drop
      // fractional balances that arrived before their metadata.
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '1e-18' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '0.000000000000000001' });
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

    it('replaces covered-chain balances in merge mode when replaceCoveredChainBalances is set', async () => {
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
            replaceCoveredChainBalances: true,
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_NATIVE_ASSET_ID]: { amount: '2' },
              },
            },
          },
          'TestSource',
        );

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

    it('overlays balances without removing tokens when merge mode is used', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '6.185173' },
            [MOCK_NATIVE_ASSET_ID]: { amount: '0.000390285791392' },
          },
        },
      };

      await withController({ state: initialState }, async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            updateMode: 'merge',
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_NATIVE_ASSET_ID]: { amount: '0.000389261286724' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '6.185173' });
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
            MOCK_NATIVE_ASSET_ID
          ],
        ).toStrictEqual({ amount: '0.000389261286724' });
      });
    });

    it('seeds missing metadata in merge mode for RPC-only chains', async () => {
      const avaxNative = 'eip155:43114/slip44:9005' as Caip19AssetId;

      await withController({ state: {} }, async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            updateMode: 'merge',
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [avaxNative]: { amount: '1.5' },
              },
            },
            assetsInfo: {
              [avaxNative]: {
                type: 'native',
                symbol: 'AVAX',
                name: 'Avalanche',
                decimals: 18,
              },
            },
          },
          'RpcDataSource',
        );

        expect(controller.state.assetsInfo[avaxNative]?.symbol).toBe('AVAX');
        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[avaxNative],
        ).toStrictEqual({ amount: '1.5' });
      });
    });

    it('updates balance amounts present in merge mode response', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [MOCK_ASSET_ID]: { amount: '1' },
          },
        },
      };

      await withController({ state: initialState }, async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            updateMode: 'merge',
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '2' },
              },
            },
          },
          'TestSource',
        );

        expect(
          controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
        ).toStrictEqual({ amount: '2' });
      });
    });

    it('updates state from AccountActivityService:balanceUpdated', async () => {
      const arbNative = 'eip155:42161/slip44:60' as Caip19AssetId;
      const initialState: Partial<AssetsControllerState> = {
        assetsBalance: {
          [MOCK_ACCOUNT_ID]: {
            [arbNative]: { amount: '1' },
          },
        },
      };

      await withController(
        { state: initialState },
        async ({ controller, messenger }) => {
          messenger.publish('AccountActivityService:balanceUpdated', {
            address: '0x1234567890123456789012345678901234567890',
            chain: 'eip155:42161',
            updates: [
              {
                asset: {
                  fungible: true,
                  type: arbNative,
                  unit: 'ETH',
                  decimals: 18,
                },
                postBalance: { amount: '0x10aa6d94e80' },
                transfers: [],
              },
            ],
          });

          await flushPromises();

          expect(
            controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[arbNative],
          ).toStrictEqual({ amount: '0.00000114526056' });
        },
      );
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
    it('force refreshes assets when transaction is confirmed', async () => {
      await withController(async ({ controller, messenger }) => {
        const getAssetsSpy = jest
          .spyOn(controller, 'getAssets')
          .mockResolvedValue({});

        messenger.publish('TransactionController:transactionConfirmed', {
          chainId: '0xa4b1',
          txParams: { from: '0x1234567890123456789012345678901234567890' },
        });

        await flushPromises();

        expect(getAssetsSpy).toHaveBeenCalledWith(
          [expect.objectContaining({ id: MOCK_ACCOUNT_ID })],
          {
            chainIds: ['eip155:42161'],
            forceUpdate: true,
          },
        );

        getAssetsSpy.mockRestore();
      });
    });

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

    it('replaces pre-lock balances on unlock via merge with covered-chain replacement', async () => {
      const fetchV5MultiAccountBalances = jest.fn().mockResolvedValue({
        balances: [
          {
            accountId: 'eip155:1:0x1234567890123456789012345678901234567890',
            assetId: MOCK_NATIVE_ASSET_ID,
            balance: '2',
          },
        ],
        unprocessedNetworks: [],
      });

      const queryApiClient = {
        ...createMockQueryApiClient(),
        accounts: {
          fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
            fullSupport: [1],
            partialSupport: [],
          }),
          fetchV5MultiAccountBalances,
        },
      } as unknown as ApiPlatformClient;

      await withController(
        {
          clientControllerState: { isUiOpen: true },
          queryApiClient,
          state: {
            assetsBalance: {
              [MOCK_ACCOUNT_ID]: {
                [MOCK_ASSET_ID]: { amount: '100' },
                [MOCK_NATIVE_ASSET_ID]: { amount: '0.5' },
              },
            },
          },
        },
        async ({ controller, messenger }) => {
          (
            messenger as unknown as {
              publish: (topic: string, payload?: unknown) => void;
            }
          ).publish('ClientController:stateChange', { isUiOpen: true });
          messenger.publish('KeyringController:unlock');

          await flushPromises();

          expect(
            controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[MOCK_ASSET_ID],
          ).toBeUndefined();
          expect(
            controller.state.assetsBalance[MOCK_ACCOUNT_ID]?.[
              MOCK_NATIVE_ASSET_ID
            ],
          ).toStrictEqual({ amount: '2' });
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

    it('refreshes assets when a network is added or removed', async () => {
      await withController(async ({ messenger }) => {
        (messenger.publish as CallableFunction)(
          'NetworkController:networkAdded',
          { chainId: '0x89' },
        );
        (messenger.publish as CallableFunction)(
          'NetworkController:networkRemoved',
          { chainId: '0x89' },
        );

        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

    it('subscribes and fetches assets when the selected EVM network switches', async () => {
      const sepoliaHex = '0xaa36a7';
      const mainnetHex = '0x1';
      let selectedNetworkClientId = 'sepolia';

      const getNetworkState = (): NetworkState => ({
        networkConfigurationsByChainId: {
          [sepoliaHex]: { chainId: sepoliaHex },
          [mainnetHex]: { chainId: mainnetHex },
        } as NetworkState['networkConfigurationsByChainId'],
        networksMetadata: {} as NetworkState['networksMetadata'],
        selectedNetworkClientId,
      });

      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      messenger.registerActionHandler(
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
        () => [createMockInternalAccount()],
      );
      messenger.registerActionHandler(
        'NetworkEnablementController:getState',
        () => ({
          enabledNetworkMap: { eip155: { '1': true, '11155111': true } },
          nativeAssetIdentifiers: {
            'eip155:1': MOCK_NATIVE_ASSET_ID,
            'eip155:11155111': 'eip155:11155111/slip44:60' as Caip19AssetId,
          },
        }),
      );
      messenger.registerActionHandler(
        'NetworkController:getState',
        getNetworkState,
      );
      (
        messenger as {
          registerActionHandler: (
            a: string,
            h: (id: string) => unknown,
          ) => void;
        }
      ).registerActionHandler(
        'NetworkController:getNetworkClientById',
        (networkClientId: string) => ({
          provider: {},
          configuration: {
            chainId: networkClientId === 'mainnet' ? mainnetHex : sepoliaHex,
          },
        }),
      );
      (
        messenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('ClientController:getState', () => ({
        isUiOpen: true,
      }));

      const fetchV2SupportedNetworks = jest.fn().mockResolvedValue({
        fullSupport: [1, 11155111],
        partialSupport: [],
      });

      const queryApiClient = {
        ...createMockQueryApiClient(),
        accounts: {
          fetchV2SupportedNetworks,
          fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
            balances: [],
            unprocessedNetworks: [],
          }),
        },
      } as unknown as ApiPlatformClient;

      const controller = new AssetsController({
        messenger: messenger as unknown as AssetsControllerMessenger,
        queryApiClient,
        subscribeToBasicFunctionalityChange: (): void => {
          /* no-op */
        },
      });

      const getAssetsSpy = jest.spyOn(controller, 'getAssets');

      try {
        (
          messenger as unknown as {
            publish: (topic: string, payload?: unknown) => void;
          }
        ).publish('ClientController:stateChange', { isUiOpen: true });
        messenger.publish('KeyringController:unlock');
        await flushPromises();

        getAssetsSpy.mockClear();
        fetchV2SupportedNetworks.mockClear();

        selectedNetworkClientId = 'mainnet';
        (messenger.publish as CallableFunction)(
          'NetworkController:networkDidChange',
          getNetworkState(),
        );

        await flushPromises();

        expect(fetchV2SupportedNetworks).toHaveBeenCalled();
        expect(getAssetsSpy).toHaveBeenCalledWith(
          [expect.objectContaining({ id: MOCK_ACCOUNT_ID })],
          expect.objectContaining({
            chainIds: ['eip155:1'],
            forceUpdate: true,
            dataTypes: ['balance', 'metadata', 'price'],
          }),
        );
      } finally {
        getAssetsSpy.mockRestore();
        await flushPromises();
        controller.destroy();
      }
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
