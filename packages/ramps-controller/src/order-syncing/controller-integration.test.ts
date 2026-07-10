import { RampsOrderStatus } from '../RampsService';
import type { RampsOrder } from '../RampsService';
import {
  deleteOrderInRemoteStorage,
  syncOrdersWithUserStorage,
  updateOrderInRemoteStorage,
} from './controller-integration';
import {
  USER_STORAGE_RAMPS_ORDERS_FEATURE,
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants';
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
    const addOrder = jest.fn();
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
      addOrder,
      removeOrder,
    };

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
  });

  describe('updateOrderInRemoteStorage', () => {
    it('writes a single order entry', async () => {
      const order = createMockOrder();
      const { options, performSetStorage } = arrangeMocks();

      await updateOrderInRemoteStorage(order, options);

      expect(performSetStorage).toHaveBeenCalledWith(
        `${USER_STORAGE_RAMPS_ORDERS_FEATURE}.abc-123`,
        expect.stringContaining('"abc-123"'),
      );
    });

    it('no-ops when syncing is disabled', async () => {
      const { options, performSetStorage } = arrangeMocks({
        isBackupAndSyncEnabled: false,
      });

      await updateOrderInRemoteStorage(createMockOrder(), options);

      expect(performSetStorage).not.toHaveBeenCalled();
    });
  });

  describe('deleteOrderInRemoteStorage', () => {
    it('soft-deletes an existing remote order', async () => {
      const order = createMockOrder();
      const existingEntry = JSON.stringify(
        mapRampsOrderToUserStorageEntry({
          ...order,
          lastUpdatedAt: Date.now(),
        }),
      );
      const { options, performGetStorage, performSetStorage } = arrangeMocks();
      performGetStorage.mockResolvedValue(existingEntry);

      await deleteOrderInRemoteStorage(order, options);

      expect(performSetStorage).toHaveBeenCalledWith(
        `${USER_STORAGE_RAMPS_ORDERS_FEATURE}.abc-123`,
        expect.stringContaining(
          `"${USER_STORAGE_VERSION_KEY}":"${USER_STORAGE_VERSION}"`,
        ),
      );
      const saved = JSON.parse(
        performSetStorage.mock.calls[0][1] as string,
      ) as { dt?: number };
      expect(saved.dt).toEqual(expect.any(Number));
    });
  });
});
