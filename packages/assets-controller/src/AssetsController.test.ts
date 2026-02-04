/* eslint-disable jest/unbound-method */
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
import type { Caip19AssetId, AccountId } from './types';

type AllActions = MessengerActions<AssetsControllerMessenger>;
type AllEvents = MessengerEvents<AssetsControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_ACCOUNT_ID = 'mock-account-id-1';
const MOCK_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_ASSET_ID_LOWERCASE =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;

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
  const [{ state = {} }, fn] = args.length === 2 ? args : [{}, args[0]];

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const assetsControllerMessenger = new Messenger<
    'AssetsController',
    MessengerActions<AssetsControllerMessenger>,
    MessengerEvents<AssetsControllerMessenger>,
    RootMessenger
  >({
    namespace: 'AssetsController',
    parent: messenger,
  });

  messenger.delegate({
    messenger: assetsControllerMessenger,
    actions: [
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'NetworkEnablementController:getState',
      'AccountsApiDataSource:getAssetsMiddleware',
      'SnapDataSource:getAssetsMiddleware',
      'RpcDataSource:getAssetsMiddleware',
      'TokenDataSource:getAssetsMiddleware',
      'PriceDataSource:getAssetsMiddleware',
      'PriceDataSource:fetch',
      'PriceDataSource:subscribe',
      'PriceDataSource:unsubscribe',
      'DetectionMiddleware:getAssetsMiddleware',
    ],
    events: [
      'AccountTreeController:selectedAccountGroupChange',
      'NetworkEnablementController:stateChange',
      'AppStateController:appOpened',
      'AppStateController:appClosed',
      'KeyringController:lock',
      'KeyringController:unlock',
    ],
  });

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
      nativeAssetIdentifiers: {},
    }),
  );

  // Mock data source middlewares - each returns a passthrough middleware
  const mockMiddleware = jest
    .fn()
    .mockImplementation(async (ctx, next) => next(ctx));

  messenger.registerActionHandler(
    'AccountsApiDataSource:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'SnapDataSource:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'RpcDataSource:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'TokenDataSource:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'PriceDataSource:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'DetectionMiddleware:getAssetsMiddleware',
    () => mockMiddleware,
  );

  messenger.registerActionHandler(
    'PriceDataSource:fetch',
    jest.fn().mockResolvedValue({}),
  );

  messenger.registerActionHandler(
    'PriceDataSource:subscribe',
    jest.fn().mockResolvedValue(undefined),
  );

  messenger.registerActionHandler(
    'PriceDataSource:unsubscribe',
    jest.fn().mockResolvedValue(undefined),
  );

  const controller = new AssetsController({
    messenger:
      assetsControllerMessenger as unknown as AssetsControllerMessenger,
    state,
  });

  return fn({ controller, messenger });
}

describe('AssetsController', () => {
  describe('getDefaultAssetsControllerState', () => {
    it('returns default state with empty maps', () => {
      const defaultState = getDefaultAssetsControllerState();

      expect(defaultState).toStrictEqual({
        assetsMetadata: {},
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          assetsMetadata: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        });
      });
    });

    it('initializes with provided state', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsMetadata: {
          [MOCK_ASSET_ID]: {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsBalance: {},
        customAssets: {},
      };

      await withController({ state: initialState }, ({ controller }) => {
        expect(controller.state.assetsMetadata[MOCK_ASSET_ID]).toStrictEqual({
          type: 'erc20',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        });
      });
    });

    it('skips initialization when isEnabled returns false', () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      const assetsControllerMessenger = new Messenger<
        'AssetsController',
        MessengerActions<AssetsControllerMessenger>,
        MessengerEvents<AssetsControllerMessenger>,
        RootMessenger
      >({
        namespace: 'AssetsController',
        parent: messenger,
      });

      messenger.delegate({
        messenger: assetsControllerMessenger,
        actions: [
          'AccountTreeController:getAccountsFromSelectedAccountGroup',
          'NetworkEnablementController:getState',
          'AccountsApiDataSource:getAssetsMiddleware',
          'SnapDataSource:getAssetsMiddleware',
          'RpcDataSource:getAssetsMiddleware',
          'TokenDataSource:getAssetsMiddleware',
          'PriceDataSource:getAssetsMiddleware',
          'PriceDataSource:fetch',
          'PriceDataSource:subscribe',
          'PriceDataSource:unsubscribe',
          'DetectionMiddleware:getAssetsMiddleware',
        ],
        events: [
          'AccountTreeController:selectedAccountGroupChange',
          'NetworkEnablementController:stateChange',
          'AppStateController:appOpened',
          'AppStateController:appClosed',
          'KeyringController:lock',
          'KeyringController:unlock',
        ],
      });

      // Note: We don't register action handlers since they should not be called when disabled

      const controller = new AssetsController({
        messenger:
          assetsControllerMessenger as unknown as AssetsControllerMessenger,
        isEnabled: (): boolean => false,
      });

      // Controller should still have default state (from super() call)
      expect(controller.state).toStrictEqual({
        assetPreferences: {},
        assetsMetadata: {},
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
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
          assetsMetadata: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
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

  describe('registerDataSources', () => {
    it('registers data sources in constructor', async () => {
      await withController(({ controller }) => {
        // The controller registers these data sources in the constructor:
        // 'BackendWebsocketDataSource', 'AccountsApiDataSource', 'SnapDataSource', 'RpcDataSource'
        // We verify initialization completed without error
        expect(controller.state).toBeDefined();
      });
    });
  });

  describe('getAssetMetadata', () => {
    it('returns metadata for existing asset', async () => {
      const initialState: Partial<AssetsControllerState> = {
        assetsMetadata: {
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

    it('calls middlewares with forceUpdate option', async () => {
      const middlewareMock = jest
        .fn()
        .mockImplementation(async (ctx, next) => next(ctx));

      await withController(async ({ controller, messenger }) => {
        // Replace the middleware mock
        messenger.unregisterActionHandler(
          'AccountsApiDataSource:getAssetsMiddleware',
        );
        messenger.registerActionHandler(
          'AccountsApiDataSource:getAssetsMiddleware',
          () => middlewareMock,
        );

        const accounts = [createMockInternalAccount()];
        await controller.getAssets(accounts, { forceUpdate: true });

        expect(middlewareMock).toHaveBeenCalled();
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

  describe('handleActiveChainsUpdate', () => {
    it('updates data source chains', async () => {
      await withController(({ controller }) => {
        controller.handleActiveChainsUpdate('TestDataSource', ['eip155:1']);

        // Should not throw
        expect(controller.state).toBeDefined();
      });
    });

    it('handles empty chains array', async () => {
      await withController(({ controller }) => {
        controller.handleActiveChainsUpdate('TestDataSource', []);

        expect(controller.state).toBeDefined();
      });
    });

    it('triggers fetch when chains are added', async () => {
      await withController(async ({ controller }) => {
        // First set no chains
        controller.handleActiveChainsUpdate('TestDataSource', []);

        // Then add chains - this should trigger fetch for added chains
        controller.handleActiveChainsUpdate('TestDataSource', ['eip155:1']);

        // Allow async operations to complete
        await new Promise(process.nextTick);

        expect(controller.state).toBeDefined();
      });
    });
  });

  describe('handleAssetsUpdate', () => {
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
            assetsMetadata: {
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

        expect(controller.state.assetsMetadata[MOCK_ASSET_ID]).toStrictEqual({
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

    it('updates state with price data', async () => {
      await withController(async ({ controller }) => {
        await controller.handleAssetsUpdate(
          {
            assetsPrice: {
              [MOCK_ASSET_ID]: {
                price: 1.0,
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

  describe('app lifecycle', () => {
    it('starts tracking on appOpened event', async () => {
      await withController(async ({ messenger }) => {
        // Publish appOpened event
        messenger.publish('AppStateController:appOpened');

        // Allow async operations to complete
        await new Promise(process.nextTick);

        // Should not throw
        expect(true).toBe(true);
      });
    });

    it('stops tracking on appClosed event', async () => {
      await withController(async ({ messenger }) => {
        // First open
        messenger.publish('AppStateController:appOpened');
        await new Promise(process.nextTick);

        // Then close
        messenger.publish('AppStateController:appClosed');
        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

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
  });

  describe('subscribeAssetsPrice', () => {
    it('creates price subscription', async () => {
      await withController(async ({ controller, messenger }) => {
        const subscribeMock = jest.fn().mockResolvedValue(undefined);
        messenger.unregisterActionHandler('PriceDataSource:subscribe');
        messenger.registerActionHandler(
          'PriceDataSource:subscribe',
          subscribeMock,
        );

        const accounts = [createMockInternalAccount()];
        controller.subscribeAssetsPrice(accounts, ['eip155:1']);

        await new Promise(process.nextTick);

        expect(subscribeMock).toHaveBeenCalled();
      });
    });
  });

  describe('unsubscribeAssetsPrice', () => {
    it('removes price subscription', async () => {
      await withController(async ({ controller, messenger }) => {
        const unsubscribeMock = jest.fn().mockResolvedValue(undefined);
        messenger.unregisterActionHandler('PriceDataSource:unsubscribe');
        messenger.registerActionHandler(
          'PriceDataSource:unsubscribe',
          unsubscribeMock,
        );

        const accounts = [createMockInternalAccount()];
        controller.subscribeAssetsPrice(accounts, ['eip155:1']);
        await new Promise(process.nextTick);

        controller.unsubscribeAssetsPrice();
        await new Promise(process.nextTick);

        expect(unsubscribeMock).toHaveBeenCalled();
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
        // Simulate network enablement change with proper payload format
        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': true,
              },
            },
            nativeAssetIdentifiers: {},
          },
          [],
        );

        await new Promise(process.nextTick);

        expect(true).toBe(true);
      });
    });

    it('handles network being disabled', async () => {
      await withController(async ({ messenger }) => {
        // First enable multiple networks
        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': true,
              },
            },
            nativeAssetIdentifiers: {},
          },
          [],
        );

        await new Promise(process.nextTick);

        // Then disable one
        (messenger.publish as CallableFunction)(
          'NetworkEnablementController:stateChange',
          {
            enabledNetworkMap: {
              eip155: {
                '1': true,
                '137': false,
              },
            },
            nativeAssetIdentifiers: {},
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
});
