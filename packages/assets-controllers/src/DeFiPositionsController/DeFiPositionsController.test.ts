import { BtcAccountType } from '@metamask/keyring-api';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import * as calculateDefiMetrics from './calculate-defi-metrics';
import type { DeFiPositionsControllerMessenger } from './DeFiPositionsController';
import {
  DeFiPositionsController,
  getDefaultDefiPositionsControllerState,
} from './DeFiPositionsController';
import * as fetchPositions from './fetch-positions';
import * as groupDeFiPositions from './group-defi-positions';
import { flushPromises } from '../../../../tests/helpers';
import { createMockInternalAccount } from '../../../accounts-controller/src/tests/mocks';
import type {
  InternalAccount,
  TransactionMeta,
} from '../../../transaction-controller/src/types';

const OWNER_ACCOUNTS = [
  createMockInternalAccount({
    id: 'mock-id-1',
    address: '0x0000000000000000000000000000000000000001',
  }),
  createMockInternalAccount({
    id: 'mock-id-2',
    address: '0x0000000000000000000000000000000000000002',
  }),
  createMockInternalAccount({
    id: 'mock-id-btc',
    type: BtcAccountType.P2wpkh,
  }),
];

type AllDefiPositionsControllerActions =
  MessengerActions<DeFiPositionsControllerMessenger>;

type AllDefiPositionsControllerEvents =
  MessengerEvents<DeFiPositionsControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllDefiPositionsControllerActions,
  AllDefiPositionsControllerEvents
>;

/**
 * Sets up the controller with the given configuration
 *
 * @param config - Configuration for the mock setup
 * @param config.isEnabled - Whether the controller is enabled
 * @param config.mockTrackEvent - The mock track event function
 * @param config.mockFetchPositions - The mock fetch positions function
 * @param config.mockGroupDeFiPositions - The mock group positions function
 * @param config.mockCalculateDefiMetrics - The mock calculate metrics function
 * @returns The controller instance, trigger functions, and spies
 */
function setupController({
  isEnabled,
  mockTrackEvent,
  mockFetchPositions = jest.fn(),
  mockGroupDeFiPositions = jest.fn(),
  mockCalculateDefiMetrics = jest.fn(),
}: {
  isEnabled?: () => boolean;
  mockFetchPositions?: jest.Mock;
  mockGroupDeFiPositions?: jest.Mock;
  mockCalculateDefiMetrics?: jest.Mock;
  mockTrackEvent?: jest.Mock;
} = {}) {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const mockListAccounts = jest.fn().mockReturnValue(OWNER_ACCOUNTS);
  messenger.registerActionHandler(
    'AccountsController:listAccounts',
    mockListAccounts,
  );

  const defiPositionControllerMessenger = new Messenger<
    'DeFiPositionsController',
    AllDefiPositionsControllerActions,
    AllDefiPositionsControllerEvents,
    RootMessenger
  >({
    namespace: 'DeFiPositionsController',
    parent: messenger,
  });
  messenger.delegate({
    messenger: defiPositionControllerMessenger,
    actions: ['AccountsController:listAccounts'],
    events: [
      'KeyringController:unlock',
      'KeyringController:lock',
      'TransactionController:transactionConfirmed',
      'AccountsController:accountAdded',
    ],
  });

  const buildPositionsFetcherSpy = jest.spyOn(
    fetchPositions,
    'buildPositionFetcher',
  );

  buildPositionsFetcherSpy.mockReturnValue(mockFetchPositions);

  const groupDeFiPositionsSpy = jest.spyOn(
    groupDeFiPositions,
    'groupDeFiPositions',
  );

  const calculateDefiMetricsSpy = jest.spyOn(
    calculateDefiMetrics,
    'calculateDeFiPositionMetrics',
  );
  calculateDefiMetricsSpy.mockImplementation(mockCalculateDefiMetrics);

  groupDeFiPositionsSpy.mockImplementation(mockGroupDeFiPositions);

  const controller = new DeFiPositionsController({
    messenger: defiPositionControllerMessenger,
    isEnabled,
    trackEvent: mockTrackEvent,
  });

  const updateSpy = jest.spyOn(controller, 'update' as never);

  const triggerUnlock = (): void => {
    messenger.publish('KeyringController:unlock');
  };

  const triggerLock = (): void => {
    messenger.publish('KeyringController:lock');
  };

  const triggerTransactionConfirmed = (address: string): void => {
    messenger.publish('TransactionController:transactionConfirmed', {
      txParams: {
        from: address,
      },
    } as TransactionMeta);
  };

  const triggerAccountAdded = (account: Partial<InternalAccount>): void => {
    messenger.publish(
      'AccountsController:accountAdded',
      account as InternalAccount,
    );
  };

  return {
    controller,
    triggerUnlock,
    triggerLock,
    triggerTransactionConfirmed,
    triggerAccountAdded,
    buildPositionsFetcherSpy,
    updateSpy,
    mockFetchPositions,
    mockGroupDeFiPositions,
    mockCalculateDefiMetrics,
    mockTrackEvent,
  };
}

describe('DeFiPositionsController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets default state', async () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );
  });

  it('stops polling if the keyring is locked', async () => {
    const { controller, triggerLock } = setupController();
    const stopAllPollingSpy = jest.spyOn(controller, 'stopAllPolling');

    triggerLock();

    await flushPromises();

    expect(stopAllPollingSpy).toHaveBeenCalled();
  });

  it('starts polling if the keyring is unlocked', async () => {
    const { controller, triggerUnlock } = setupController();
    const startPollingSpy = jest.spyOn(controller, 'startPolling');

    triggerUnlock();

    await flushPromises();

    expect(startPollingSpy).toHaveBeenCalled();
  });

  it('fetches positions for all accounts when polling', async () => {
    const mockFetchPositions = jest.fn().mockImplementation((address) => {
      // eslint-disable-next-line jest/no-conditional-in-test
      if (OWNER_ACCOUNTS[0].address === address) {
        return 'mock-fetch-data-1';
      }

      throw new Error('Error fetching positions');
    });
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');

    const { controller, buildPositionsFetcherSpy, updateSpy } = setupController(
      {
        mockFetchPositions,
        mockGroupDeFiPositions,
      },
    );

    await controller._executePoll();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
        [OWNER_ACCOUNTS[1].address]: null,
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[1].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(2);

    expect(mockGroupDeFiPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupDeFiPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions when polling and the controller is disabled', async () => {
    const {
      controller,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupDeFiPositions,
    } = setupController({
      isEnabled: () => false,
    });

    await controller._executePoll();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupDeFiPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for an account when a transaction is confirmed', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');

    const {
      controller,
      triggerTransactionConfirmed,
      buildPositionsFetcherSpy,
      updateSpy,
    } = setupController({
      mockFetchPositions,
      mockGroupDeFiPositions,
    });

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(mockGroupDeFiPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupDeFiPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions for an account when a transaction is confirmed and the controller is disabled', async () => {
    const {
      controller,
      triggerTransactionConfirmed,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupDeFiPositions,
    } = setupController({
      isEnabled: () => false,
    });

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupDeFiPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for an account when a new account is added', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');

    const {
      controller,
      triggerAccountAdded,
      buildPositionsFetcherSpy,
      updateSpy,
    } = setupController({
      mockFetchPositions,
      mockGroupDeFiPositions,
    });

    const newAccountAddress = '0x0000000000000000000000000000000000000003';
    triggerAccountAdded({
      type: 'eip155:eoa',
      address: newAccountAddress,
    });
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [newAccountAddress]: 'mock-grouped-data-1',
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(newAccountAddress);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(mockGroupDeFiPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupDeFiPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions for an account when a new account is added and the controller is disabled', async () => {
    const {
      controller,
      triggerAccountAdded,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupDeFiPositions,
    } = setupController({
      isEnabled: () => false,
    });

    triggerAccountAdded({
      type: 'eip155:eoa',
      address: '0x0000000000000000000000000000000000000003',
    });
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupDeFiPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('updates defi count and calls metrics', async () => {
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');

    const mockTrackEvent = jest.fn();

    const mockMetric1 = {
      event: 'mock-event',
      category: 'mock-category',
      properties: {
        totalPositions: 1,
        totalMarketValueUSD: 1,
      },
    };

    const mockMetric2 = {
      event: 'mock-event',
      category: 'mock-category',
      properties: {
        totalPositions: 2,
        totalMarketValueUSD: 2,
      },
    };

    const mockCalculateDefiMetrics = jest
      .fn()
      .mockReturnValueOnce(mockMetric1)
      .mockReturnValueOnce(mockMetric2);

    const { controller } = setupController({
      mockGroupDeFiPositions,
      mockCalculateDefiMetrics,
      mockTrackEvent,
    });

    await controller._executePoll();

    expect(mockCalculateDefiMetrics).toHaveBeenCalled();
    expect(mockCalculateDefiMetrics).toHaveBeenCalledWith(
      controller.state.allDeFiPositions[OWNER_ACCOUNTS[0].address],
    );

    expect(controller.state.allDeFiPositionsCount).toStrictEqual({
      [OWNER_ACCOUNTS[0].address]: mockMetric1.properties.totalPositions,
      [OWNER_ACCOUNTS[1].address]: mockMetric2.properties.totalPositions,
    });

    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, mockMetric1);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, mockMetric2);
    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, mockMetric1);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, mockMetric2);
  });

  it('only calls track metric when position count changes', async () => {
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');
    const mockTrackEvent = jest.fn();

    const mockMetric1 = {
      event: 'mock-event',
      category: 'mock-category',
      properties: {
        totalPositions: 1,
        totalMarketValueUSD: 1,
      },
    };

    const mockMetric2 = {
      event: 'mock-event',
      category: 'mock-category',
      properties: {
        totalPositions: 2,
        totalMarketValueUSD: 2,
      },
    };

    const mockCalculateDefiMetrics = jest
      .fn()
      .mockReturnValueOnce(mockMetric1)
      .mockReturnValueOnce(mockMetric2)
      .mockReturnValueOnce(mockMetric2);

    const { controller, triggerTransactionConfirmed } = setupController({
      mockGroupDeFiPositions,
      mockCalculateDefiMetrics,
      mockTrackEvent,
    });

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(mockCalculateDefiMetrics).toHaveBeenCalled();
    expect(mockCalculateDefiMetrics).toHaveBeenCalledWith(
      controller.state.allDeFiPositions[OWNER_ACCOUNTS[0].address],
    );

    expect(controller.state.allDeFiPositionsCount).toStrictEqual({
      [OWNER_ACCOUNTS[0].address]: mockMetric2.properties.totalPositions,
    });

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, mockMetric1);
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, mockMetric2);
  });
});
