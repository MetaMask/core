import { RampsOrderStatus } from '../RampsService';
import type { RampsOrder } from '../RampsService';
import { USER_STORAGE_RAMPS_ORDERS_FEATURE } from './constants';
import {
  deleteOrderInRemoteStorage,
  syncOrdersWithUserStorage,
  updateOrderInRemoteStorage,
} from './controller-integration';
import type { OrderSyncingOptions, SyncRampsOrder } from './types';
import { mapRampsOrderToUserStorageEntry } from './utils';

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
  } = {}) => {
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

    it('applies remote soft-deletes locally', async () => {
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
      expect(saved.dt).toEqual(expect.any(Number));
    });
  });
});
