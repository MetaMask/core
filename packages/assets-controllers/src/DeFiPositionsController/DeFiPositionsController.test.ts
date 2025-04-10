import { BtcAccountType } from '@metamask/keyring-api';

import type { DeFiPositionsControllerMessenger } from './DeFiPositionsController';
import {
  DeFiPositionsController,
  getDefaultDefiPositionsControllerState,
} from './DeFiPositionsController';
import * as fetchPositions from './fetch-positions';
import * as groupPositions from './group-positions';
import { flushPromises } from '../../../../tests/helpers';
import { createMockInternalAccount } from '../../../accounts-controller/src/tests/mocks';
import { Messenger } from '../../../base-controller/src/Messenger';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
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

type MainMessenger = Messenger<
  ExtractAvailableAction<DeFiPositionsControllerMessenger>,
  ExtractAvailableEvent<DeFiPositionsControllerMessenger>
>;

/**
 *
 * @param state - Partial state to initialize the controller with
 * @param state.interval - The interval to poll for positions
 * @param state.isEnabled - Whether the controller is enabled
 * @param state.mockFetchPositions - The mock fetch positions function
 * @param state.mockGroupPositions - The mock group positions function
 * @returns The controller instance and the trigger functions
 */
function setupController({
  interval,
  isEnabled,
  mockFetchPositions = jest.fn(),
  mockGroupPositions = jest.fn(),
}: {
  interval?: number;
  isEnabled?: () => boolean;
  mockFetchPositions?: jest.Mock;
  mockGroupPositions?: jest.Mock;
} = {}) {
  const messenger: MainMessenger = new Messenger();

  const mockListAccounts = jest.fn().mockReturnValue(OWNER_ACCOUNTS);
  messenger.registerActionHandler(
    'AccountsController:listAccounts',
    mockListAccounts,
  );

  const restrictedMessenger = messenger.getRestricted({
    name: 'DeFiPositionsController',
    allowedActions: ['AccountsController:listAccounts'],
    allowedEvents: [
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

  const groupPositionsSpy = jest.spyOn(groupPositions, 'groupPositions');

  groupPositionsSpy.mockImplementation(mockGroupPositions);

  const controller = new DeFiPositionsController({
    messenger: restrictedMessenger,
    interval,
    isEnabled,
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
    mockGroupPositions,
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
    const mockGroupPositions = jest.fn().mockReturnValue('mock-grouped-data-1');

    const { controller, buildPositionsFetcherSpy, updateSpy } = setupController(
      {
        mockFetchPositions,
        mockGroupPositions,
      },
    );

    await controller._executePoll();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
        [OWNER_ACCOUNTS[1].address]: null,
      },
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[1].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(2);

    expect(mockGroupPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions when polling and the controller is disabled', async () => {
    const {
      controller,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupPositions,
    } = setupController({
      isEnabled: () => false,
    });

    await controller._executePoll();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(mockGroupPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for an account when a transaction is confirmed', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
    const mockGroupPositions = jest.fn().mockReturnValue('mock-grouped-data-1');

    const {
      controller,
      triggerTransactionConfirmed,
      buildPositionsFetcherSpy,
      updateSpy,
    } = setupController({
      mockFetchPositions,
      mockGroupPositions,
    });

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(mockGroupPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions for an account when a transaction is confirmed and the controller is disabled', async () => {
    const {
      controller,
      triggerTransactionConfirmed,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupPositions,
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

    expect(mockGroupPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for an account when a new account is added', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');
    const mockGroupPositions = jest.fn().mockReturnValue('mock-grouped-data-1');

    const {
      controller,
      triggerAccountAdded,
      buildPositionsFetcherSpy,
      updateSpy,
    } = setupController({
      mockFetchPositions,
      mockGroupPositions,
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
    });

    expect(buildPositionsFetcherSpy).toHaveBeenCalled();

    expect(mockFetchPositions).toHaveBeenCalledWith(newAccountAddress);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(mockGroupPositions).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(mockGroupPositions).toHaveBeenCalledTimes(1);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions for an account when a new account is added and the controller is disabled', async () => {
    const {
      controller,
      triggerAccountAdded,
      buildPositionsFetcherSpy,
      updateSpy,
      mockFetchPositions,
      mockGroupPositions,
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

    expect(mockGroupPositions).not.toHaveBeenCalled();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
