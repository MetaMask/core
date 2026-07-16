import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { RampsControllerMessenger } from './RampsController';
import {
  RampsController,
  RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS,
} from './RampsController';
import { RampsOrderStatus } from './RampsService';
import type { RampsOrder } from './RampsService';

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
});
