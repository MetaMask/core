import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { RampsControllerMessenger } from './RampsController.js';
import {
  RampsController,
  RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS,
} from './RampsController.js';
import { RampsOrderStatus } from './RampsService.js';
import type { RampsOrder } from './RampsService.js';

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

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<RampsControllerMessenger>,
  MessengerEvents<RampsControllerMessenger>
>;

function setupControllerWithOrderSyncingMocks(): {
  controller: RampsController;
  performBatchSetStorage: jest.Mock;
  performGetStorageAllFeatureEntries: jest.Mock;
} {
  const performBatchSetStorage = jest.fn().mockResolvedValue(undefined);
  const performGetStorageAllFeatureEntries = jest
    .fn()
    .mockResolvedValue([] as string[]);

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler('UserStorageController:getState', () => ({
    isBackupAndSyncEnabled: true,
    isRampsSyncingEnabled: true,
  }));
  rootMessenger.registerActionHandler(
    'UserStorageController:performGetStorageAllFeatureEntries',
    performGetStorageAllFeatureEntries,
  );
  rootMessenger.registerActionHandler(
    'UserStorageController:performBatchSetStorage',
    performBatchSetStorage,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:isSignedIn',
    () => true,
  );

  const messenger: RampsControllerMessenger = new Messenger({
    namespace: 'RampsController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      ...RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS,
      'UserStorageController:getState',
      'UserStorageController:performGetStorageAllFeatureEntries',
      'UserStorageController:performBatchSetStorage',
      'AuthenticationController:isSignedIn',
    ],
  });

  const controller = new RampsController({ messenger });

  return {
    controller,
    performBatchSetStorage,
    performGetStorageAllFeatureEntries,
  };
}

describe('RampsController order syncing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the order syncing semaphore getter and setter', () => {
    const { controller } = setupControllerWithOrderSyncingMocks();

    expect(controller.isOrderSyncingInProgress).toBe(false);
    controller.setIsOrderSyncingInProgress(true);
    expect(controller.isOrderSyncingInProgress).toBe(true);
    controller.setIsOrderSyncingInProgress(false);
    expect(controller.isOrderSyncingInProgress).toBe(false);
  });

  it('delegates syncOrdersWithUserStorage to the order-syncing module', async () => {
    const { controller, performGetStorageAllFeatureEntries } =
      setupControllerWithOrderSyncingMocks();

    performGetStorageAllFeatureEntries.mockResolvedValue([]);

    await controller.syncOrdersWithUserStorage();

    expect(performGetStorageAllFeatureEntries).toHaveBeenCalled();
  });

  it('stamps lastUpdatedAt on local addOrder edits', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const { controller } = setupControllerWithOrderSyncingMocks();

    controller.addOrder({
      providerOrderId: 'order-1',
      status: 'PENDING',
      createdAt: 1,
    } as never);

    expect(controller.state.orders[0]).toStrictEqual(
      expect.objectContaining({
        providerOrderId: 'order-1',
        lastUpdatedAt: 1_700_000_000_000,
      }),
    );
  });

  it('logs incremental addOrder remote sync failures without throwing', async () => {
    const { controller, performBatchSetStorage } =
      setupControllerWithOrderSyncingMocks();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    performBatchSetStorage.mockRejectedValue(new Error('remote write failed'));

    controller.addOrder(createMockOrder());

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error updating ramps order in remote storage:',
      expect.any(Error),
    );
  });

  it('logs incremental removeOrder remote sync failures without throwing', async () => {
    const { controller, performBatchSetStorage } =
      setupControllerWithOrderSyncingMocks();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    performBatchSetStorage.mockRejectedValue(new Error('remote delete failed'));

    controller.addOrder(createMockOrder());
    controller.removeOrder('abc-123');

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error deleting ramps order from remote storage:',
      expect.any(Error),
    );
  });

  it('skips incremental remote writes while full sync is in progress', async () => {
    const { controller, performBatchSetStorage } =
      setupControllerWithOrderSyncingMocks();

    controller.setIsOrderSyncingInProgress(true);
    controller.addOrder(createMockOrder());

    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(performBatchSetStorage).not.toHaveBeenCalled();
  });

  it('queues mid-sync deletes and drains them after sync', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_700);
    const {
      controller,
      performBatchSetStorage,
      performGetStorageAllFeatureEntries,
    } = setupControllerWithOrderSyncingMocks();

    const order = createMockOrder({
      providerOrderId: 'mid-sync-delete',
      id: '/providers/transak/orders/mid-sync-delete',
    });
    controller.addOrder(order);
    performBatchSetStorage.mockClear();

    performGetStorageAllFeatureEntries.mockImplementation(async () => {
      controller.removeOrder('mid-sync-delete');
      return [];
    });

    await controller.syncOrdersWithUserStorage();

    expect(controller.state.orders).toHaveLength(0);
    expect(performBatchSetStorage).toHaveBeenCalledWith(
      'rampsOrders',
      expect.arrayContaining([
        expect.arrayContaining(['mid-sync-delete', expect.any(String)]),
      ]),
    );
    const tombstone = JSON.parse(
      (performBatchSetStorage.mock.calls[0][1] as [string, string][]).find(
        ([key]) => key === 'mid-sync-delete',
      )?.[1] as string,
    ) as { dt?: number };
    expect(tombstone.dt).toBe(1_700_000_000_700);
  });

  it('coalesces overlapping syncOrdersWithUserStorage calls', async () => {
    const { controller, performGetStorageAllFeatureEntries } =
      setupControllerWithOrderSyncingMocks();

    let releaseFirstFetch: (() => void) | undefined;
    const firstFetchStarted = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });

    performGetStorageAllFeatureEntries
      .mockImplementationOnce(async () => {
        await firstFetchStarted;
        return [];
      })
      .mockResolvedValue([]);

    const firstSync = controller.syncOrdersWithUserStorage();
    const secondSync = controller.syncOrdersWithUserStorage();

    releaseFirstFetch?.();
    await Promise.all([firstSync, secondSync]);

    expect(performGetStorageAllFeatureEntries).toHaveBeenCalledTimes(2);
  });

  it('handles sync requests that arrive after worker checks flag but before completion', async () => {
    const { controller, performGetStorageAllFeatureEntries } =
      setupControllerWithOrderSyncingMocks();

    let resolveLateRequest: (() => void) | undefined;
    const lateRequestQueued = new Promise<void>((resolve) => {
      resolveLateRequest = resolve;
    });

    let firstSyncNearCompletion = false;
    performGetStorageAllFeatureEntries.mockImplementation(async () => {
      if (firstSyncNearCompletion) {
        return [];
      }
      firstSyncNearCompletion = true;
      await lateRequestQueued;
      return [];
    });

    const firstSync = controller.syncOrdersWithUserStorage();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const lateSync = controller.syncOrdersWithUserStorage();
    resolveLateRequest?.();

    await Promise.all([firstSync, lateSync]);

    expect(performGetStorageAllFeatureEntries).toHaveBeenCalledTimes(2);
  });

  it('recursively calls syncOrdersWithUserStorage when flag is still set after waiting', async () => {
    const { controller, performGetStorageAllFeatureEntries } =
      setupControllerWithOrderSyncingMocks();

    let unblockFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      unblockFirst = resolve;
    });

    let callCount = 0;
    performGetStorageAllFeatureEntries.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstBlocked;
      }
      return [];
    });

    const firstSync = controller.syncOrdersWithUserStorage();
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    const secondSync = controller.syncOrdersWithUserStorage();

    unblockFirst?.();
    await Promise.all([firstSync, secondSync]);

    expect(callCount).toBe(2);
  });

  it('preserves createdAt as lastUpdatedAt when syncing remotes without lu', () => {
    const { controller } = setupControllerWithOrderSyncingMocks();

    controller.setIsOrderSyncingInProgress(true);
    controller.addOrder({
      ...createMockOrder({
        providerOrderId: 'no-lu',
        id: '/providers/transak/orders/no-lu',
        createdAt: 1_111,
      }),
    });

    expect(controller.state.orders[0]).toStrictEqual(
      expect.objectContaining({
        providerOrderId: 'no-lu',
        lastUpdatedAt: 1_111,
      }),
    );
  });

  it('uses 0 lastUpdatedAt when syncing remotes without lu or createdAt', () => {
    const { controller } = setupControllerWithOrderSyncingMocks();

    controller.setIsOrderSyncingInProgress(true);
    controller.addOrder({
      providerOrderId: 'no-timestamps',
      id: '/providers/transak/orders/no-timestamps',
    } as never);

    expect(controller.state.orders[0]).toStrictEqual(
      expect.objectContaining({
        providerOrderId: 'no-timestamps',
        lastUpdatedAt: 0,
      }),
    );
  });

  it('ignores addOrder calls that cannot derive a storage key', () => {
    const { controller } = setupControllerWithOrderSyncingMocks();

    controller.addOrder({
      id: '/providers/transak/orders/',
      providerOrderId: '',
    } as never);

    expect(controller.state.orders).toHaveLength(0);
  });
});
