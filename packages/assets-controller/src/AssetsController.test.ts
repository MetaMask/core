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
        customAssets: {},
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          assetsMetadata: {},
          assetsBalance: {},
          customAssets: {},
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
});
