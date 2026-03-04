import type { InternalAccount } from '@metamask/keyring-internal-api';
import { TransactionStatus } from '@metamask/transaction-controller';

import type { StakedBalanceDataSourceOptions } from './StakedBalanceDataSource';
import { StakedBalanceDataSource } from './StakedBalanceDataSource';
import {
  MockRootMessenger,
  createMockAssetControllerMessenger,
  createMockWeb3Provider,
  registerStakedMessengerActions,
} from '../__fixtures__/MockAssetControllerMessenger';
import type { AssetsControllerMessenger } from '../AssetsController';
import type {
  AssetsControllerStateInternal,
  ChainId,
  Context,
  DataRequest,
} from '../types';

const MAINNET_CHAIN_ID_HEX = '0x1';
const MAINNET_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const STAKING_CONTRACT_MAINNET = '0x4FEF9D741011476750A243aC70b9789a63dd47Df';
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';

function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
    address: MOCK_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [MAINNET_CHAIN_ID_CAIP],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [MAINNET_CHAIN_ID_CAIP];
  const accounts = overrides?.accounts ?? [createMockInternalAccount()];
  const { accounts: _a, ...rest } = overrides ?? {};
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['balance'],
    ...rest,
  };
}

function getMockAssetsState(): AssetsControllerStateInternal {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
  };
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: getMockAssetsState,
    ...overrides,
  };
}

type WithControllerOptions = {
  options?: Partial<StakedBalanceDataSourceOptions>;
  enabledNetworkMap?: Record<string, Record<string, boolean>>;
  mockProvider?: ReturnType<typeof createMockWeb3Provider>;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
  onActiveChainsUpdated,
  mockProvider,
}: {
  controller: StakedBalanceDataSource;
  messenger: AssetsControllerMessenger;
  mockMessengerCall: jest.SpyInstance;
  mockMessengerSubscribe: jest.SpyInstance;
  mockMessengerUnsubscribe: jest.SpyInstance;
  rootMessenger: MockRootMessenger;
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  mockProvider: ReturnType<typeof createMockWeb3Provider>;
}) => Promise<ReturnValue> | ReturnValue;

async function withController<ReturnValue>(
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [controllerOptions, fn] = args.length === 2 ? args : [{}, args[0]];
  const {
    options = {},
    enabledNetworkMap = { eip155: { [MAINNET_CHAIN_ID_HEX]: true } },
    mockProvider = createMockWeb3Provider({
      sharesWei: '1000000000000000000',
      assetsWei: '1500000000000000000',
    }),
  } = controllerOptions;

  const { assetsControllerMessenger, rootMessenger } =
    createMockAssetControllerMessenger();
  registerStakedMessengerActions(rootMessenger, {
    enabledNetworkMap,
    mockProvider,
  });

  // spy on staked messenger calls, so we can inspect and assert
  const mockStakedMessengerCall = jest.spyOn(assetsControllerMessenger, 'call');

  // spy on staked messenger subscriptions, so we can inspect and assert
  const mockStakedMessengerSubscribe = jest.spyOn(
    assetsControllerMessenger,
    'subscribe',
  );

  // spy on staked messenger unsubscribe, so we can inspect and assert
  const mockStakedMessengerUnsubscribe = jest.spyOn(
    assetsControllerMessenger,
    'clearEventSubscriptions',
  );

  const onActiveChainsUpdated =
    (
      options as {
        onActiveChainsUpdated?: (n: string, c: ChainId[], p: ChainId[]) => void;
      }
    ).onActiveChainsUpdated ?? jest.fn();

  const controller = new StakedBalanceDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated,
    ...options,
    pollInterval: 1000,
  });

  try {
    return await fn({
      controller,
      messenger: assetsControllerMessenger,
      mockMessengerCall: mockStakedMessengerCall,
      mockMessengerSubscribe: mockStakedMessengerSubscribe,
      mockMessengerUnsubscribe: mockStakedMessengerUnsubscribe,
      onActiveChainsUpdated,
      mockProvider,
      rootMessenger,
    });
  } finally {
    controller.destroy();
  }
}

describe('StakedBalanceDataSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default options', async () => {
      await withController(({ controller }) => {
        expect(controller).toBeInstanceOf(StakedBalanceDataSource);
        expect(controller.getName()).toBe('StakedBalanceDataSource');
      });
    });

    it('initializes with custom poll interval', async () => {
      await withController(
        { options: { pollInterval: 60_000 } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('initializes with enabled: false and has no active chains', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          expect(controller).toBeDefined();
          expect(await controller.getActiveChains()).toStrictEqual([]);
        },
      );
    });

    it('calls onActiveChainsUpdated with active staking chains when mainnet is enabled', async () => {
      await withController(({ onActiveChainsUpdated }) => {
        expect(onActiveChainsUpdated).toHaveBeenCalledWith(
          'StakedBalanceDataSource',
          expect.arrayContaining([MAINNET_CHAIN_ID_CAIP]),
          [],
        );
      });
    });

    it('subscribes to transaction and network events', async () => {
      await withController(({ mockMessengerSubscribe }) => {
        expect(mockMessengerSubscribe).toHaveBeenCalledWith(
          'TransactionController:transactionConfirmed',
          expect.any(Function),
        );
        expect(mockMessengerSubscribe).toHaveBeenCalledWith(
          'TransactionController:incomingTransactionsReceived',
          expect.any(Function),
        );
        expect(mockMessengerSubscribe).toHaveBeenCalledWith(
          'NetworkController:stateChange',
          expect.any(Function),
        );
        expect(mockMessengerSubscribe).toHaveBeenCalledWith(
          'NetworkEnablementController:stateChange',
          expect.any(Function),
        );
      });
    });
  });

  describe('getName', () => {
    it('returns the data source name', async () => {
      await withController(({ controller }) => {
        expect(controller.getName()).toBe('StakedBalanceDataSource');
      });
    });
  });

  describe('getActiveChainsSync', () => {
    it('returns active chains when mainnet is enabled', async () => {
      await withController(async ({ controller }) => {
        const chains = await controller.getActiveChains();
        expect(chains).toContain(MAINNET_CHAIN_ID_CAIP);
      });
    });

    it('returns empty array when no staking chains are enabled', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const chains = await controller.getActiveChains();
          expect(chains).toHaveLength(0);
        },
      );
    });
  });

  describe('fetch', () => {
    it('returns empty response when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          const request = createDataRequest();
          const response = await controller.fetch(request);
          expect(response).toStrictEqual({});
        },
      );
    });

    it('returns empty response when no active chains', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const request = createDataRequest();
          const response = await controller.fetch(request);
          expect(response).toStrictEqual({});
        },
      );
    });

    it('returns empty response for unsupported chain', async () => {
      await withController(async ({ controller }) => {
        const request = createDataRequest({
          chainIds: ['eip155:999' as ChainId],
          accountsWithSupportedChains: [
            {
              account: createMockInternalAccount(),
              supportedChains: ['eip155:999' as ChainId],
            },
          ],
        });
        const response = await controller.fetch(request);
        expect(response).toStrictEqual({});
      });
    });

    it('returns staked balance and metadata for mainnet when fetcher returns data', async () => {
      await withController(
        async ({ controller, mockMessengerCall: mockMessengerCalls }) => {
          const account = createMockInternalAccount();
          const request = createDataRequest({
            accounts: [account],
            chainIds: [MAINNET_CHAIN_ID_CAIP],
            accountsWithSupportedChains: [
              { account, supportedChains: [MAINNET_CHAIN_ID_CAIP] },
            ],
          });

          const response = await controller.fetch(request);
          expect(response).toBeDefined();

          expect(mockMessengerCalls).toHaveBeenCalledWith(
            'NetworkController:getNetworkClientById',
            'mainnet',
          );
        },
      );
    });

    it('returns zero amount when getShares returns zero', async () => {
      await withController(
        {
          mockProvider: createMockWeb3Provider({
            sharesWei: '0',
            assetsWei: '0',
          }),
        },
        async ({ controller }) => {
          const account = createMockInternalAccount();
          const request = createDataRequest({
            accounts: [account],
            chainIds: [MAINNET_CHAIN_ID_CAIP],
            accountsWithSupportedChains: [
              { account, supportedChains: [MAINNET_CHAIN_ID_CAIP] },
            ],
          });
          const response = await controller.fetch(request);
          expect(response).toBeDefined();
        },
      );
    });
  });

  describe('subscribe', () => {
    it('stores subscription and calls onAssetsUpdate after initial fetch', async () => {
      await withController(async ({ controller }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        expect(await controller.getActiveChains()).toContain(
          MAINNET_CHAIN_ID_CAIP,
        );
        await controller.unsubscribe('test-sub');
      });
    });

    it('does not call onAssetsUpdate when no staking chains to subscribe', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const onAssetsUpdate = jest.fn();
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
            getAssetsState: getMockAssetsState,
          });
          expect(onAssetsUpdate).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('unsubscribe', () => {
    it('removes subscription and stops polling', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
          getAssetsState: getMockAssetsState,
        });
        await controller.unsubscribe('test-sub');
        const chains = await controller.getActiveChains();
        expect(chains.length).toBeGreaterThan(0);
      });
    });
  });

  describe('transaction events', () => {
    const arrange = async (props: {
      controller: StakedBalanceDataSource;
    }): Promise<jest.Mock> => {
      // subscribe and wait ensure polling finishes before we start test
      const onAssetsUpdate = jest.fn();
      await props.controller.subscribe({
        request: createDataRequest(),
        subscriptionId: 'test-sub',
        isUpdate: false,
        onAssetsUpdate,
        getAssetsState: getMockAssetsState,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      onAssetsUpdate.mockClear();

      return onAssetsUpdate;
    };

    it('refreshes staked balance when transactionConfirmed involves staking contract (to)', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        // Arrange
        const onAssetsUpdate = await arrange({ controller });

        // Act
        rootMessenger.publish('TransactionController:transactionConfirmed', {
          id: '1',
          networkClientId: 'mainnet',
          status: TransactionStatus.confirmed,
          time: Date.now(),
          chainId: MAINNET_CHAIN_ID_HEX,
          txParams: {
            to: STAKING_CONTRACT_MAINNET,
            from: '0x0000000000000000000000000000000000000000',
          },
        });

        // Assert
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });

    it('does not refresh when transactionConfirmed does not involve staking contract', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        // Arrange
        const onAssetsUpdate = await arrange({ controller });

        // Act
        rootMessenger.publish('TransactionController:transactionConfirmed', {
          id: '1',
          networkClientId: 'mainnet',
          status: TransactionStatus.confirmed,
          time: Date.now(),
          chainId: MAINNET_CHAIN_ID_HEX,
          txParams: {
            from: '0xabcdef1234567890abcdef1234567890abcdef12',
            to: '0x1234567890123456789012345678901234567890',
          },
        });

        // Assert
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('refreshes when transactionConfirmed has from equal to staking contract', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        // Arrange
        const onAssetsUpdate = await arrange({ controller });

        // Act
        rootMessenger.publish('TransactionController:transactionConfirmed', {
          id: '1',
          networkClientId: 'mainnet',
          status: TransactionStatus.confirmed,
          time: Date.now(),
          chainId: MAINNET_CHAIN_ID_HEX,
          txParams: { from: STAKING_CONTRACT_MAINNET.toLowerCase() },
        });

        // Assert
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });

    it('refreshes when incomingTransactionsReceived includes tx involving staking contract', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        // Arrange
        const onAssetsUpdate = await arrange({ controller });

        // Act
        rootMessenger.publish(
          'TransactionController:incomingTransactionsReceived',
          [
            {
              id: '1',
              networkClientId: 'mainnet',
              status: TransactionStatus.confirmed,
              time: Date.now(),
              chainId: MAINNET_CHAIN_ID_HEX,
              txParams: {
                to: STAKING_CONTRACT_MAINNET,
                from: '0x0000000000000000000000000000000000000000',
              },
            },
          ],
        );

        // Assert
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate).toHaveBeenCalledTimes(1);
      });
    });

    it('does not refresh when incomingTransactionsReceived has no tx involving staking contract', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        // Arrange
        const onAssetsUpdate = await arrange({ controller });

        // Act
        rootMessenger.publish(
          'TransactionController:incomingTransactionsReceived',
          [
            {
              id: '1',
              networkClientId: 'mainnet',
              status: TransactionStatus.confirmed,
              time: Date.now(),
              chainId: MAINNET_CHAIN_ID_HEX,
              txParams: {
                to: '0x1234567890123456789012345678901234567890',
                from: '0x0000000000000000000000000000000000000000',
              },
            },
          ],
        );

        // Assert
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('refreshStakedBalance', () => {
    it('pushes updates for all subscribed accounts and chains', async () => {
      await withController(async ({ controller }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        expect(await controller.refreshStakedBalance()).toBeUndefined();
      });
    });

    it('does nothing when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          expect(await controller.refreshStakedBalance()).toBeUndefined();
        },
      );
    });
  });

  describe('assetsMiddleware', () => {
    it('passes through when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          const next = jest.fn().mockResolvedValue(undefined);
          const context = createMiddlewareContext();
          await controller.assetsMiddleware(context, next);
          expect(next).toHaveBeenCalledWith(context);
          expect(context.response).toStrictEqual({});
        },
      );
    });

    it('merges staked balance into response when balance data type requested', async () => {
      await withController(async ({ controller }) => {
        const next = jest.fn().mockResolvedValue(undefined);
        const context = createMiddlewareContext();
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
        const hasBalance =
          context.response.assetsBalance &&
          Object.keys(context.response.assetsBalance).length > 0;
        expect(!hasBalance || context.response.assetsInfo !== undefined).toBe(
          true,
        );
      });
    });

    it('passes through without fetching when dataTypes does not include balance', async () => {
      await withController(async ({ controller }) => {
        const next = jest.fn().mockResolvedValue(undefined);
        const request = createDataRequest();
        request.dataTypes = ['price'];
        const context = createMiddlewareContext({ request, response: {} });
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
        expect(context.response.assetsBalance).toBeUndefined();
      });
    });
  });
});
