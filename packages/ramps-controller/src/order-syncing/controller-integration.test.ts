import { RampsOrderStatus } from '../RampsService.js';
import type { RampsOrder } from '../RampsService.js';
import {
  USER_STORAGE_RAMPS_ORDERS_FEATURE,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants.js';
import {
  deleteOrderInRemoteStorage,
  orderSyncingTestExports,
  syncOrdersWithUserStorage,
  updateOrderInRemoteStorage,
} from './controller-integration.js';
import type { OrderSyncingOptions, SyncRampsOrder } from './types.js';
import { mapRampsOrderToUserStorageEntry } from './utils.js';

function createMockOrder(overrides: Partial<RampsOrder> = {}): RampsOrder {
  return {
    id: '/providers/transak/orders/abc-123',
    isOnlyLink: false,
    provider: { id: 'transak', name: 'Transak' } as RampsOrder['provider'],
    success: true,
    cryptoAmount: 0.05,
    fiatAmount: 100,
    cryptoCurrency: { symbol: 'ETH', decimals: 18 },
    fiatCurrency: { symbol: 'USD', decimals: 2, denomSymbol: '$' },
    providerOrderId: 'abc-123',
    providerOrderLink: 'https://transak.com/order/abc-123',
    createdAt: 1700000000000,
    paymentMethod: { id: '/payments/debit-credit-card', name: 'Card' },
    totalFeesFiat: 5,
    txHash: '',
    walletAddress: '0xabc',
    status: RampsOrderStatus.Completed,
    network: { chainId: '1', name: 'Ethereum Mainnet' },
    canBeUpdated: false,
    idHasExpired: false,
    excludeFromPurchases: false,
    timeDescriptionPending: '',
    orderType: 'BUY',
    ...overrides,
  };
}

describe('order-syncing/controller-integration', () => {
  const arrangeMocks = ({
    localOrders = [] as RampsOrder[],
    remoteEntries = null as string[] | null,
    isBackupAndSyncEnabled = true,
    isRampsSyncingEnabled = true,
    isSignedIn = true,
  } = {}): {
    options: OrderSyncingOptions;
    addOrder: jest.Mock;
    removeOrder: jest.Mock;
    setIsOrderSyncingInProgress: jest.Mock;
    performBatchSetStorage: jest.Mock;
    performSetStorage: jest.Mock;
    performGetStorage: jest.Mock;
    performGetStorageAllFeatureEntries: jest.Mock;
  } => {
    const removeOrder = jest.fn();
    const setIsOrderSyncingInProgress = jest.fn();
    const performBatchSetStorage = jest.fn().mockResolvedValue(undefined);
    const performSetStorage = jest.fn().mockResolvedValue(undefined);
    const performGetStorage = jest.fn().mockResolvedValue(null);
    const performGetStorageAllFeatureEntries = jest
      .fn()
      .mockResolvedValue(remoteEntries);

    const controller = {
      state: { orders: localOrders },
      isOrderSyncingInProgress: false,
      setIsOrderSyncingInProgress,
      addOrder: jest.fn(),
      removeOrder,
      drainPendingRemoteDeletes: jest.fn().mockReturnValue([]),
    };

    const addOrder = jest.fn((order: RampsOrder) => {
      const existingIndex = controller.state.orders.findIndex(
        (existing) => existing.providerOrderId === order.providerOrderId,
      );

      if (existingIndex === -1) {
        controller.state.orders.push(order);
        return;
      }

      controller.state.orders[existingIndex] = {
        ...controller.state.orders[existingIndex],
        ...order,
      };
    });
    controller.addOrder = addOrder;

    const messengerCall = jest
      .fn()
      .mockImplementation((action: string, ...args: unknown[]) => {
        switch (action) {
          case 'UserStorageController:getState':
            return { isBackupAndSyncEnabled, isRampsSyncingEnabled };
          case 'AuthenticationController:isSignedIn':
            return isSignedIn;
          case 'UserStorageController:listEntropySources':
            return ['entropy-primary'];
          case 'UserStorageController:performGetStorageAllFeatureEntries':
            return performGetStorageAllFeatureEntries(...args);
          case 'UserStorageController:performBatchSetStorage':
            return performBatchSetStorage(...args);
          case 'UserStorageController:performSetStorage':
            return performSetStorage(...args);
          case 'UserStorageController:performGetStorage':
            return performGetStorage(...args);
          default:
            return null;
        }
      });

    const options: OrderSyncingOptions = {
      getRampsControllerInstance: () => controller,
      getMessenger: () =>
        ({ call: messengerCall }) as ReturnType<
          OrderSyncingOptions['getMessenger']
        >,
    };

    return {
      options,
      addOrder,
      removeOrder,
      setIsOrderSyncingInProgress,
      performBatchSetStorage,
      performSetStorage,
      performGetStorage,
      performGetStorageAllFeatureEntries,
    };
  };

  describe('syncOrdersWithUserStorage', () => {
    it('no-ops when syncing conditions are not met', async () => {
      const { options, performGetStorageAllFeatureEntries } = arrangeMocks({
        isRampsSyncingEnabled: false,
        localOrders: [createMockOrder()],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(performGetStorageAllFeatureEntries).not.toHaveBeenCalled();
    });

    it('uploads local-only orders on first sync', async () => {
      const localOrder = createMockOrder();
      const { options, performBatchSetStorage, setIsOrderSyncingInProgress } =
        arrangeMocks({
          localOrders: [localOrder],
          remoteEntries: null,
        });

      await syncOrdersWithUserStorage({}, options);

      expect(setIsOrderSyncingInProgress).toHaveBeenCalledWith(true);
      expect(setIsOrderSyncingInProgress).toHaveBeenCalledWith(false);
      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
        ]),
      );
    });

    it('imports remote-only orders on new device sync', async () => {
      const remoteOrder = createMockOrder({
        providerOrderId: 'remote-1',
        id: '/providers/transak/orders/remote-1',
      });
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...remoteOrder,
          lastUpdatedAt: Date.now(),
        }),
      );

      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({ providerOrderId: 'remote-1' }),
      );
    });

    it('keeps the freshest remote entry when duplicate storage keys are returned', async () => {
      const olderRemote = createMockOrder({
        providerOrderId: 'dup-key',
        id: '/providers/transak/orders/dup-key',
        fiatAmount: 100,
      });
      const newerRemote = createMockOrder({
        providerOrderId: 'dup-key',
        id: '/providers/transak/orders/dup-key',
        fiatAmount: 999,
      });
      const olderEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...olderRemote,
          lastUpdatedAt: 1_700_000_000_000,
        }),
      );
      const newerEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...newerRemote,
          lastUpdatedAt: 1_700_000_000_100,
        }),
      );

      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: [olderEntry, newerEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).toHaveBeenCalledTimes(1);
      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOrderId: 'dup-key',
          fiatAmount: 999,
        }),
      );
    });

    it('keeps an earlier fresher remote entry over a later stale duplicate', async () => {
      const newerRemote = createMockOrder({
        providerOrderId: 'dup-key-2',
        id: '/providers/transak/orders/dup-key-2',
        fiatAmount: 500,
      });
      const olderRemote = createMockOrder({
        providerOrderId: 'dup-key-2',
        id: '/providers/transak/orders/dup-key-2',
        fiatAmount: 50,
      });
      const newerEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...newerRemote,
          lastUpdatedAt: 1_700_000_000_200,
        }),
      );
      const olderEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...olderRemote,
          lastUpdatedAt: 1_700_000_000_000,
        }),
      );

      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: [newerEntry, olderEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).toHaveBeenCalledTimes(1);
      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOrderId: 'dup-key-2',
          fiatAmount: 500,
        }),
      );
    });

    it('prefers a newer remote tombstone over an older live duplicate key', async () => {
      const liveRemote = createMockOrder({
        providerOrderId: 'dup-tombstone',
        id: '/providers/transak/orders/dup-tombstone',
        fiatAmount: 100,
      });
      const tombstoneRemote: SyncRampsOrder = {
        ...liveRemote,
        deletedAt: 1_700_000_000_300,
        lastUpdatedAt: 1_700_000_000_300,
      };
      const liveEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...liveRemote,
          lastUpdatedAt: 1_700_000_000_000,
        }),
      );
      const tombstoneEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(tombstoneRemote),
      );

      const { options, addOrder, removeOrder } = arrangeMocks({
        localOrders: [liveRemote],
        remoteEntries: [liveEntry, tombstoneEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).not.toHaveBeenCalled();
      expect(removeOrder).toHaveBeenCalledWith('dup-tombstone');
    });

    it('applies remote soft-deletes locally when the tombstone is newer', async () => {
      const localOrder = createMockOrder();
      const deletedRemote: SyncRampsOrder = {
        ...localOrder,
        deletedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(deletedRemote),
      );

      const { options, removeOrder } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(removeOrder).toHaveBeenCalledWith('abc-123');
    });

    it('restores a newer local order over an older remote tombstone', async () => {
      const localOrder = createMockOrder({
        fiatAmount: 250,
        createdAt: Date.now(),
      });
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100 }),
        deletedAt: 1700000000000,
        lastUpdatedAt: 1700000000000,
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(deletedRemote),
      );

      const { options, removeOrder, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(removeOrder).not.toHaveBeenCalled();
      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
        ]),
      );
    });

    it('does not persist tombstone metadata when uploading active local orders', async () => {
      const localOrder = createMockOrder({ fiatAmount: 250 });
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100 }),
        deletedAt: 1700000000000,
        lastUpdatedAt: 1700000000000,
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(deletedRemote),
      );

      const { options, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      const saved = JSON.parse(
        performBatchSetStorage.mock.calls[0][1][0][1] as string,
      ) as { dt?: number };
      expect(saved.dt).toBeUndefined();
    });

    it('uploads locally newer conflicting orders to remote', async () => {
      const localOrder = createMockOrder({
        fiatAmount: 300,
        createdAt: Date.now(),
      });
      const remoteOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100 }),
        lastUpdatedAt: 1,
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(remoteOrder),
      );

      const { options, addOrder, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).not.toHaveBeenCalled();
      expect(performBatchSetStorage).toHaveBeenCalled();
    });

    it('skips remote upload when local and remote orders are identical', async () => {
      const order = createMockOrder();
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...order,
          lastUpdatedAt: Date.now(),
        }),
      );

      const { options, performBatchSetStorage } = arrangeMocks({
        localOrders: [order],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('replaces stale queued uploads with fresher local orders', async () => {
      const localOrder = createMockOrder({ fiatAmount: 100 });
      const updatedLocalOrder = createMockOrder({ fiatAmount: 500 });

      const performBatchSetStorage = jest.fn().mockResolvedValue(undefined);
      const performGetStorageAllFeatureEntries = jest
        .fn()
        .mockResolvedValue(null);

      const controller = {
        state: { orders: [localOrder] },
        isOrderSyncingInProgress: false,
        setIsOrderSyncingInProgress: jest.fn((value: boolean) => {
          if (value) {
            controller.state.orders = [updatedLocalOrder];
          }
        }),
        addOrder: jest.fn(),
        removeOrder: jest.fn(),
        drainPendingRemoteDeletes: jest.fn().mockReturnValue([]),
      };

      const messengerCall = jest
        .fn()
        .mockImplementation((action: string, ...callArgs: unknown[]) => {
          if (action === 'UserStorageController:getState') {
            return {
              isBackupAndSyncEnabled: true,
              isRampsSyncingEnabled: true,
            };
          }
          if (action === 'AuthenticationController:isSignedIn') {
            return true;
          }
          if (action === 'UserStorageController:listEntropySources') {
            return ['entropy-primary'];
          }
          if (
            action ===
            'UserStorageController:performGetStorageAllFeatureEntries'
          ) {
            return performGetStorageAllFeatureEntries();
          }
          if (action === 'UserStorageController:performBatchSetStorage') {
            return performBatchSetStorage(...callArgs);
          }
          return null;
        });

      const options: OrderSyncingOptions = {
        getRampsControllerInstance: () => controller,
        getMessenger: () =>
          ({ call: messengerCall }) as ReturnType<
            OrderSyncingOptions['getMessenger']
          >,
      };

      await syncOrdersWithUserStorage({}, options);

      const saved = JSON.parse(
        performBatchSetStorage.mock.calls[0][1][0][1] as string,
      ) as { o: { fiatAmount: number } };
      expect(saved.o.fiatAmount).toBe(500);
    });

    it('keeps the newer side when content conflicts', async () => {
      const localOrder = createMockOrder({ fiatAmount: 100 });
      const remoteOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 200 }),
        lastUpdatedAt: Date.now() + 10_000,
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(remoteOrder),
      );

      const { options, addOrder, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({ fiatAmount: 200 }),
      );
      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('prefers local edits with newer lastUpdatedAt over stale remote content', async () => {
      const localOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 500, createdAt: 1 }),
        lastUpdatedAt: Date.now(),
      };
      const remoteOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100, createdAt: 1 }),
        lastUpdatedAt: 10,
      };
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry(remoteOrder),
      );

      const { options, addOrder, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).not.toHaveBeenCalled();
      expect(performBatchSetStorage).toHaveBeenCalled();
      const saved = JSON.parse(
        performBatchSetStorage.mock.calls[0][1][0][1] as string,
      ) as { o: { fiatAmount: number } };
      expect(saved.o.fiatAmount).toBe(500);
    });

    it('uploads local-only orders when remote fetch returns an empty array', async () => {
      const localOrder = createMockOrder();
      const { options, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(performBatchSetStorage).toHaveBeenCalled();
    });

    it('aborts sync when remote fetch fails instead of treating it as empty', async () => {
      const onOrderSyncErroneousSituation = jest.fn();
      const {
        options,
        performBatchSetStorage,
        performGetStorageAllFeatureEntries,
      } = arrangeMocks({
        localOrders: [createMockOrder()],
      });

      performGetStorageAllFeatureEntries.mockRejectedValue(
        new Error('network down'),
      );

      await expect(
        syncOrdersWithUserStorage({ onOrderSyncErroneousSituation }, options),
      ).rejects.toThrow('network down');

      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Failed to fetch remote ramps orders',
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('skips corrupt remote entries while still importing valid ones', async () => {
      const onOrderSyncErroneousSituation = jest.fn();
      const remoteOrder = createMockOrder({
        providerOrderId: 'valid-remote',
        id: '/providers/transak/orders/valid-remote',
      });
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...remoteOrder,
          lastUpdatedAt: Date.now(),
        }),
      );

      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: ['{invalid-json', remoteEntry],
      });

      await syncOrdersWithUserStorage(
        { onOrderSyncErroneousSituation },
        options,
      );

      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Failed to parse remote ramps order entry',
        expect.objectContaining({
          error: expect.any(SyntaxError),
          entryLength: expect.any(Number),
        }),
      );
      expect(onOrderSyncErroneousSituation.mock.calls[0][1]).not.toHaveProperty(
        'orderJson',
      );
      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({ providerOrderId: 'valid-remote' }),
      );
    });

    it('skips remote entries with unsupported version or missing payload', async () => {
      const onOrderSyncErroneousSituation = jest.fn();
      const remoteOrder = createMockOrder({
        providerOrderId: 'valid-remote',
        id: '/providers/transak/orders/valid-remote',
      });
      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: [
          JSON.stringify({
            [USER_STORAGE_VERSION_KEY]: '999',
            o: remoteOrder,
          }),
          JSON.stringify({
            [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
          }),
          JSON.stringify(
            mapRampsOrderToUserStorageEntry({
              ...remoteOrder,
              lastUpdatedAt: Date.now(),
            }),
          ),
        ],
      });

      await syncOrdersWithUserStorage(
        { onOrderSyncErroneousSituation },
        options,
      );

      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Unsupported ramps order storage version',
        expect.objectContaining({ version: '999' }),
      );
      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Remote ramps order entry missing order payload',
        {},
      );
      expect(addOrder).toHaveBeenCalledTimes(1);
    });

    it('skips remote entries that cannot derive a storage key', async () => {
      const remoteOrder = createMockOrder({
        providerOrderId: 'valid-remote-2',
        id: '/providers/transak/orders/valid-remote-2',
      });
      const { options, addOrder } = arrangeMocks({
        localOrders: [],
        remoteEntries: [
          JSON.stringify({
            [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
            o: {
              ...remoteOrder,
              id: '/providers/transak/orders/',
              providerOrderId: '',
            },
            lu: Date.now(),
          }),
          JSON.stringify(
            mapRampsOrderToUserStorageEntry({
              ...remoteOrder,
              lastUpdatedAt: Date.now(),
            }),
          ),
        ],
      });

      await syncOrdersWithUserStorage({}, options);

      expect(addOrder).toHaveBeenCalledTimes(1);
      expect(addOrder).toHaveBeenCalledWith(
        expect.objectContaining({ providerOrderId: 'valid-remote-2' }),
      );
    });

    it('reports and skips empty storage keys when uploading', async () => {
      const onOrderSyncErroneousSituation = jest.fn();
      const { options, performBatchSetStorage } = arrangeMocks();

      await orderSyncingTestExports.saveOrdersToUserStorage(
        [
          createMockOrder({
            id: '/providers/transak/orders/',
            providerOrderId: '',
          }),
        ],
        options,
        { onOrderSyncErroneousSituation },
      );

      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Skipping ramps order remote write with empty storage key',
        expect.objectContaining({
          hasId: true,
          hasProviderOrderId: false,
        }),
      );
      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('uploads tombstones for orders deleted while sync is in progress', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_500);
      const localOrder = createMockOrder();
      const deletedDuringSync = createMockOrder({
        providerOrderId: 'deleted-mid-sync',
        id: '/providers/transak/orders/deleted-mid-sync',
      });

      const { options, performBatchSetStorage } = arrangeMocks({
        localOrders: [localOrder],
        remoteEntries: [],
      });

      const controller = options.getRampsControllerInstance();
      (controller.drainPendingRemoteDeletes as jest.Mock).mockReturnValue([
        deletedDuringSync,
      ]);

      await syncOrdersWithUserStorage({}, options);

      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
          expect.arrayContaining(['deleted-mid-sync', expect.any(String)]),
        ]),
      );

      const tombstoneEntry = JSON.parse(
        (performBatchSetStorage.mock.calls[0][1] as [string, string][]).find(
          ([key]) => key === 'deleted-mid-sync',
        )?.[1] as string,
      ) as { dt?: number; o: { paymentDetails?: unknown } };
      expect(tombstoneEntry.dt).toBe(1_700_000_000_500);
      expect(tombstoneEntry.o.paymentDetails).toBeUndefined();
    });

    it('reports sync failures via onOrderSyncErroneousSituation', async () => {
      const onOrderSyncErroneousSituation = jest.fn();
      const { options, performBatchSetStorage } = arrangeMocks({
        localOrders: [createMockOrder()],
        remoteEntries: [],
      });

      performBatchSetStorage.mockRejectedValue(new Error('batch failed'));

      await expect(
        syncOrdersWithUserStorage({ onOrderSyncErroneousSituation }, options),
      ).rejects.toThrow('batch failed');

      expect(onOrderSyncErroneousSituation).toHaveBeenCalledWith(
        'Error synchronizing ramps orders',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it('wraps full sync in trace when provided', async () => {
      const trace = jest.fn(async (_request, fn) => fn());
      const { options } = arrangeMocks({
        localOrders: [createMockOrder()],
        remoteEntries: [],
      });

      await syncOrdersWithUserStorage(
        {},
        {
          ...options,
          trace,
        },
      );

      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ramps Order Sync Full' }),
        expect.any(Function),
      );
    });

    it('records new-device sync metadata in trace', async () => {
      const trace = jest.fn(async (_request, fn) => fn());
      const remoteOrder = createMockOrder({
        providerOrderId: 'remote-only',
        id: '/providers/transak/orders/remote-only',
      });
      const remoteEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...remoteOrder,
          lastUpdatedAt: Date.now(),
        }),
      );

      const { options } = arrangeMocks({
        localOrders: [],
        remoteEntries: [remoteEntry],
      });

      await syncOrdersWithUserStorage(
        {},
        {
          ...options,
          trace,
        },
      );

      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isNewDeviceSync: true }),
        }),
        expect.any(Function),
      );
    });

    it('uploads orders added while sync is in progress', async () => {
      const localOrder = createMockOrder();
      const orderAddedDuringSync = createMockOrder({
        providerOrderId: 'during-sync-1',
        id: '/providers/transak/orders/during-sync-1',
      });

      const addOrder = jest.fn();
      const removeOrder = jest.fn();
      const performBatchSetStorage = jest.fn().mockResolvedValue(undefined);
      const performGetStorageAllFeatureEntries = jest
        .fn()
        .mockResolvedValue(null);

      const controller = {
        state: { orders: [localOrder] },
        isOrderSyncingInProgress: false,
        setIsOrderSyncingInProgress: jest.fn((value: boolean) => {
          if (value) {
            controller.state.orders = [localOrder, orderAddedDuringSync];
          }
        }),
        addOrder,
        removeOrder,
        drainPendingRemoteDeletes: jest.fn().mockReturnValue([]),
      };

      const messengerCall = jest
        .fn()
        .mockImplementation((action: string, ...callArgs: unknown[]) => {
          if (action === 'UserStorageController:getState') {
            return {
              isBackupAndSyncEnabled: true,
              isRampsSyncingEnabled: true,
            };
          }
          if (action === 'AuthenticationController:isSignedIn') {
            return true;
          }
          if (action === 'UserStorageController:listEntropySources') {
            return ['entropy-primary'];
          }
          if (
            action ===
            'UserStorageController:performGetStorageAllFeatureEntries'
          ) {
            return performGetStorageAllFeatureEntries();
          }
          if (action === 'UserStorageController:performBatchSetStorage') {
            return performBatchSetStorage(...callArgs);
          }
          return null;
        });

      const options: OrderSyncingOptions = {
        getRampsControllerInstance: () => controller,
        getMessenger: () =>
          ({ call: messengerCall }) as ReturnType<
            OrderSyncingOptions['getMessenger']
          >,
      };

      await syncOrdersWithUserStorage({}, options);

      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
          expect.arrayContaining(['during-sync-1', expect.any(String)]),
        ]),
      );
    });
  });

  describe('updateOrderInRemoteStorage', () => {
    it('writes a single order entry via batch storage', async () => {
      const order = createMockOrder();
      const { options, performBatchSetStorage } = arrangeMocks();

      await updateOrderInRemoteStorage(order, options);

      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
        ]),
      );
    });

    it('supports provider order IDs that are invalid for performSetStorage paths', async () => {
      const order = createMockOrder({
        providerOrderId: '550e8400-e29b-41d4-a716-446655440000',
        id: '/providers/transak/orders/550e8400-e29b-41d4-a716-446655440000',
      });
      const { options, performBatchSetStorage, performSetStorage } =
        arrangeMocks();

      await updateOrderInRemoteStorage(order, options);

      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining([
            '550e8400-e29b-41d4-a716-446655440000',
            expect.any(String),
          ]),
        ]),
      );
      expect(performSetStorage).not.toHaveBeenCalled();
    });

    it('no-ops when syncing is disabled', async () => {
      const { options, performBatchSetStorage } = arrangeMocks({
        isBackupAndSyncEnabled: false,
      });

      await updateOrderInRemoteStorage(createMockOrder(), options);

      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('wraps incremental updates in trace when provided', async () => {
      const trace = jest.fn(async (_request, fn) => fn());
      const order = createMockOrder();
      const { options } = arrangeMocks();

      await updateOrderInRemoteStorage(order, {
        ...options,
        trace,
      });

      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ramps Order Sync Update Remote' }),
        expect.any(Function),
      );
    });
  });

  describe('deleteOrderInRemoteStorage', () => {
    it('soft-deletes via batch storage using the local order payload', async () => {
      const order = createMockOrder();
      const { options, performBatchSetStorage, performGetStorage } =
        arrangeMocks();

      await deleteOrderInRemoteStorage(order, options);

      expect(performGetStorage).not.toHaveBeenCalled();
      expect(performBatchSetStorage).toHaveBeenCalledWith(
        USER_STORAGE_RAMPS_ORDERS_FEATURE,
        expect.arrayContaining([
          expect.arrayContaining(['abc-123', expect.any(String)]),
        ]),
      );
      const saved = JSON.parse(
        performBatchSetStorage.mock.calls[0][1][0][1] as string,
      ) as { dt?: number };
      expect(saved.dt).toStrictEqual(expect.any(Number));
    });

    it('no-ops when deleting a non-syncable order', async () => {
      const { options, performBatchSetStorage } = arrangeMocks();

      await deleteOrderInRemoteStorage(
        createMockOrder({ id: '', providerOrderId: '' }),
        options,
      );

      expect(performBatchSetStorage).not.toHaveBeenCalled();
    });

    it('wraps incremental deletes in trace when provided', async () => {
      const trace = jest.fn(async (_request, fn) => fn());
      const order = createMockOrder();
      const { options } = arrangeMocks();

      await deleteOrderInRemoteStorage(order, {
        ...options,
        trace,
      });

      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ramps Order Sync Delete Remote' }),
        expect.any(Function),
      );
    });

    it('wraps batch saves in trace when provided', async () => {
      const trace = jest.fn(async (_request, fn) => fn());
      const { options } = arrangeMocks({
        localOrders: [createMockOrder()],
        remoteEntries: [],
      });

      await syncOrdersWithUserStorage(
        {},
        {
          ...options,
          trace,
        },
      );

      expect(trace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ramps Order Sync Save Batch' }),
        expect.any(Function),
      );
    });
  });

  describe('merge helpers', () => {
    const {
      computeMergePlan,
      reconcileOrdersForRemoteUpload,
      getOrderTimestamp,
    } = orderSyncingTestExports;

    it('resolves timestamps from sync metadata, createdAt, or zero', () => {
      expect(
        getOrderTimestamp({
          ...createMockOrder(),
          lastUpdatedAt: 10,
          createdAt: 5,
        }),
      ).toBe(10);
      expect(getOrderTimestamp(createMockOrder({ createdAt: 5 }))).toBe(5);
      expect(
        getOrderTimestamp({
          providerOrderId: 'x',
        } as RampsOrder),
      ).toBe(0);
    });

    it('prefers newer local timestamps over older remote tombstones', () => {
      const localOrder = createMockOrder({ createdAt: Date.now() });
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder(),
        deletedAt: 1,
        lastUpdatedAt: 1,
      };

      const plan = computeMergePlan([localOrder], [deletedRemote]);

      expect(plan.ordersToUpdateRemotely).toHaveLength(1);
      expect(plan.ordersToDeleteLocally).toHaveLength(0);
    });

    it('restores local orders that changed after an older remote tombstone', () => {
      const localOrder = createMockOrder({ fiatAmount: 300 });
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100 }),
        deletedAt: 1,
        lastUpdatedAt: 1,
      };

      const plan = computeMergePlan([localOrder], [deletedRemote]);

      expect(plan.ordersToUpdateRemotely).toHaveLength(1);
    });

    it('applies remote tombstones when deletion is newer and content matches', () => {
      const localOrder = createMockOrder();
      const deletedRemote: SyncRampsOrder = {
        ...localOrder,
        deletedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };

      const plan = computeMergePlan([localOrder], [deletedRemote]);

      expect(plan.ordersToDeleteLocally).toHaveLength(1);
      expect(plan.ordersToUpdateRemotely).toHaveLength(0);
    });

    it('applies newer remote tombstones when content differs', () => {
      const localOrder = createMockOrder({
        fiatAmount: 300,
        createdAt: 1,
      });
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100 }),
        deletedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };

      const plan = computeMergePlan([localOrder], [deletedRemote]);

      expect(plan.ordersToDeleteLocally).toHaveLength(1);
      expect(plan.ordersToUpdateRemotely).toHaveLength(0);
    });

    it('prefers local lastUpdatedAt over older remote content during merge', () => {
      const localOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 500, createdAt: 1 }),
        lastUpdatedAt: 1000,
      };
      const remoteOrder: SyncRampsOrder = {
        ...createMockOrder({ fiatAmount: 100, createdAt: 1 }),
        lastUpdatedAt: 10,
      };

      const plan = computeMergePlan([localOrder], [remoteOrder]);

      expect(plan.ordersToUpdateRemotely).toHaveLength(1);
      expect(plan.ordersToAddOrUpdateLocally).toHaveLength(0);
    });

    it('ignores remote tombstones when no matching local order exists', () => {
      const deletedRemote: SyncRampsOrder = {
        ...createMockOrder(),
        deletedAt: Date.now(),
      };

      const plan = computeMergePlan([], [deletedRemote]);

      expect(plan.ordersToDeleteLocally).toHaveLength(0);
      expect(plan.ordersToUpdateRemotely).toHaveLength(0);
    });

    it('keeps queued uploads when the live local payload is unchanged', () => {
      const localOrder = createMockOrder();
      const remoteOrdersMap = new Map<string, SyncRampsOrder>();

      const uploads = reconcileOrdersForRemoteUpload(
        [localOrder],
        remoteOrdersMap,
        [localOrder],
      );

      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toStrictEqual(localOrder);
    });

    it('replaces queued uploads with fresher local payloads', () => {
      const staleOrder = createMockOrder({ fiatAmount: 100 });
      const freshOrder = createMockOrder({ fiatAmount: 500 });

      const uploads = reconcileOrdersForRemoteUpload([staleOrder], new Map(), [
        freshOrder,
      ]);

      expect(uploads[0]?.fiatAmount).toBe(500);
    });

    it('uploads live local orders missing from the remote map', () => {
      const localOrder = createMockOrder();

      const uploads = reconcileOrdersForRemoteUpload([], new Map(), [
        localOrder,
      ]);

      expect(uploads).toHaveLength(1);
    });

    it('skips uploads when the live local payload already matches remote', () => {
      const localOrder = createMockOrder();
      const remoteOrder: SyncRampsOrder = {
        ...localOrder,
        lastUpdatedAt: Date.now(),
      };
      const remoteOrdersMap = new Map<string, SyncRampsOrder>([
        ['abc-123', remoteOrder],
      ]);

      const uploads = reconcileOrdersForRemoteUpload([], remoteOrdersMap, [
        localOrder,
      ]);

      expect(uploads).toHaveLength(0);
    });
  });
});
