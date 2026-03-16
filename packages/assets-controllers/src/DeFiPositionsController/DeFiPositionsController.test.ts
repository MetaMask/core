import { deriveStateFromMetadata } from '@metamask/base-controller';
import { BtcAccountType, EthAccountType } from '@metamask/keyring-api';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
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
import { createMockInternalAccount } from '../../../accounts-controller/tests/mocks';
import type {
  InternalAccount,
  TransactionMeta,
} from '../../../transaction-controller/src/types';

const GROUP_ACCOUNTS = [
  createMockInternalAccount({
    id: 'mock-id-1',
    address: '0x0000000000000000000000000000000000000001',
    type: EthAccountType.Eoa,
  }),
  createMockInternalAccount({
    id: 'mock-id-btc-1',
    type: BtcAccountType.P2wpkh,
  }),
];

const GROUP_ACCOUNTS_NO_EVM = [
  createMockInternalAccount({
    id: 'mock-id-btc-3',
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
 * @param config.mockGroupAccounts - The mock group accounts function
 * @returns The controller instance, trigger functions, and spies
 */
function setupController({
  isEnabled,
  mockTrackEvent,
  mockFetchPositions = jest.fn(),
  mockGroupDeFiPositions = jest.fn(),
  mockCalculateDefiMetrics = jest.fn(),
  mockGroupAccounts = GROUP_ACCOUNTS,
}: {
  isEnabled?: () => boolean;
  mockFetchPositions?: jest.Mock;
  mockGroupDeFiPositions?: jest.Mock;
  mockCalculateDefiMetrics?: jest.Mock;
  mockTrackEvent?: jest.Mock;
  mockGroupAccounts?: InternalAccount[];
} = {}) {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  messenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => mockGroupAccounts,
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
    actions: ['AccountTreeController:getAccountsFromSelectedAccountGroup'],
    events: [
      'KeyringController:lock',
      'TransactionController:transactionConfirmed',
      'AccountTreeController:selectedAccountGroupChange',
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

  const triggerAccountGroupChange = (): void => {
    messenger.publish(
      'AccountTreeController:selectedAccountGroupChange',
      'entropy:test/0',
      '',
    );
  };

  return {
    controller,
    triggerLock,
    triggerTransactionConfirmed,
    triggerAccountGroupChange,
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

  it('fetches positions for the selected account when polling', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
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
        [GROUP_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(GROUP_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

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

    triggerTransactionConfirmed(GROUP_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [GROUP_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(GROUP_ACCOUNTS[0].address);
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

    triggerTransactionConfirmed(GROUP_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupDeFiPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('does not fetch positions for an account when a transaction is confirmed for a different than the selected account', async () => {
    const {
      controller,
      triggerTransactionConfirmed,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupDeFiPositions,
    } = setupController();

    triggerTransactionConfirmed('0x0000000000000000000000000000000000000002');
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupDeFiPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for the selected evm account when the account group changes', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
    const mockGroupDeFiPositions = jest
      .fn()
      .mockReturnValue('mock-grouped-data-1');

    const {
      controller,
      triggerAccountGroupChange,
      buildPositionsFetcherSpy,
      updateSpy,
    } = setupController({
      mockFetchPositions,
      mockGroupDeFiPositions,
    });

    triggerAccountGroupChange();
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [GROUP_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
      allDeFiPositionsCount: {},
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(GROUP_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(mockGroupDeFiPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupDeFiPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions when the account group changes and there is no evm account', async () => {
    const {
      controller,
      triggerAccountGroupChange,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupDeFiPositions,
    } = setupController({
      mockGroupAccounts: GROUP_ACCOUNTS_NO_EVM,
    });

    triggerAccountGroupChange();
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

    const mockCalculateDefiMetrics = jest.fn().mockReturnValueOnce(mockMetric1);

    const { controller } = setupController({
      mockGroupDeFiPositions,
      mockCalculateDefiMetrics,
      mockTrackEvent,
    });

    await controller._executePoll();

    expect(mockCalculateDefiMetrics).toHaveBeenCalled();
    expect(mockCalculateDefiMetrics).toHaveBeenCalledWith(
      controller.state.allDeFiPositions[GROUP_ACCOUNTS[0].address],
    );

    expect(controller.state.allDeFiPositionsCount).toStrictEqual({
      [GROUP_ACCOUNTS[0].address]: mockMetric1.properties.totalPositions,
    });

    expect(mockTrackEvent).toHaveBeenCalledWith(mockMetric1);
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
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

    const mockCalculateDefiMetrics = jest
      .fn()
      .mockReturnValueOnce(mockMetric1)
      .mockReturnValueOnce(mockMetric1);

    const { controller, triggerTransactionConfirmed } = setupController({
      mockGroupDeFiPositions,
      mockCalculateDefiMetrics,
      mockTrackEvent,
    });

    triggerTransactionConfirmed(GROUP_ACCOUNTS[0].address);
    triggerTransactionConfirmed(GROUP_ACCOUNTS[0].address);
    await flushPromises();

    expect(mockCalculateDefiMetrics).toHaveBeenCalled();
    expect(mockCalculateDefiMetrics).toHaveBeenCalledWith(
      controller.state.allDeFiPositions[GROUP_ACCOUNTS[0].address],
    );

    expect(controller.state.allDeFiPositionsCount).toStrictEqual({
      [GROUP_ACCOUNTS[0].address]: mockMetric1.properties.totalPositions,
    });

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith(mockMetric1);
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "allDeFiPositions": {},
        }
      `);
    });
  });
});
