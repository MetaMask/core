import { BtcAccountType } from '@metamask/keyring-api';

import type { DeFiPositionsControllerMessenger } from './DeFiPositionsController';
import {
  DeFiPositionsController,
  getDefaultDefiPositionsControllerState,
} from './DeFiPositionsController';
import * as fetchPositions from './fetch-positions';
import * as groupPositions from './group-positions';
import type { GroupedPositions } from './group-positions';
import { flushPromises } from '../../../../tests/helpers';
import { createMockInternalAccount } from '../../../accounts-controller/src/tests/mocks';
import { Messenger } from '../../../base-controller/src/Messenger';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
import type { TransactionMeta } from '../../../transaction-controller/src/types';

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
 * @returns The controller instance and the trigger functions
 */
function setupController({
  interval,
  isEnabled,
}: {
  interval?: number;
  isEnabled?: boolean;
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
    ],
  });

  const controller = new DeFiPositionsController({
    messenger: restrictedMessenger,
    interval,
    isEnabled,
  });

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
    } as unknown as TransactionMeta);
  };

  return {
    controller,
    triggerUnlock,
    triggerLock,
    triggerTransactionConfirmed,
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

  it('does not stop polling if the keyring is locked and the controller is disabled', async () => {
    const { controller, triggerLock } = setupController({
      isEnabled: false,
    });
    const stopAllPollingSpy = jest.spyOn(controller, 'stopAllPolling');

    triggerLock();

    await flushPromises();

    expect(stopAllPollingSpy).not.toHaveBeenCalled();
  });

  it('starts polling if the keyring is unlocked', async () => {
    const { controller, triggerUnlock } = setupController();
    const startPollingSpy = jest.spyOn(controller, 'startPolling');

    triggerUnlock();

    await flushPromises();

    expect(startPollingSpy).toHaveBeenCalled();
  });

  it('does not start polling if the keyring is unlocked and the controller is disabled', async () => {
    const { controller, triggerUnlock } = setupController({
      isEnabled: false,
    });
    const startPollingSpy = jest.spyOn(controller, 'startPolling');

    triggerUnlock();

    await flushPromises();

    expect(startPollingSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for all accounts when polling', async () => {
    const mockFetchPositions = jest.fn().mockImplementation((address) => {
      // eslint-disable-next-line jest/no-conditional-in-test
      if (OWNER_ACCOUNTS[0].address === address) {
        return 'mock-fetch-data-1';
      }

      throw new Error('Error fetching positions');
    });

    const fetchPositionsSpy = jest
      .spyOn(fetchPositions, 'buildPositionFetcher')
      .mockReturnValue(mockFetchPositions);

    const groupPositionsSpy = jest
      .spyOn(groupPositions, 'groupPositions')
      .mockReturnValue('mock-grouped-data-1' as unknown as GroupedPositions);

    const { controller } = setupController();
    const updateSpy = jest.spyOn(controller, 'update' as never);

    await controller._executePoll();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
        [OWNER_ACCOUNTS[1].address]: null,
      },
    });
    expect(fetchPositionsSpy).toHaveBeenCalled();
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[1].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(2);

    expect(groupPositionsSpy).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(groupPositionsSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fetch positions for an account when a transaction is confirmed if the controller is disabled', async () => {
    const mockFetchPositions = jest.fn();

    const fetchPositionsSpy = jest
      .spyOn(fetchPositions, 'buildPositionFetcher')
      .mockReturnValue(mockFetchPositions);

    const groupPositionsSpy = jest.spyOn(groupPositions, 'groupPositions');

    const { controller, triggerTransactionConfirmed } = setupController({
      isEnabled: false,
    });
    const updateSpy = jest.spyOn(controller, 'update' as never);

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultDefiPositionsControllerState(),
    );
    expect(fetchPositionsSpy).toHaveBeenCalled();
    expect(mockFetchPositions).not.toHaveBeenCalled();

    expect(groupPositionsSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('fetches positions for an account when a transaction is confirmed', async () => {
    const mockFetchPositions = jest.fn().mockResolvedValue('mock-fetch-data-1');

    const fetchPositionsSpy = jest
      .spyOn(fetchPositions, 'buildPositionFetcher')
      .mockReturnValue(mockFetchPositions);

    const groupPositionsSpy = jest
      .spyOn(groupPositions, 'groupPositions')
      .mockReturnValue('mock-grouped-data-1' as unknown as GroupedPositions);

    const { controller, triggerTransactionConfirmed } = setupController();
    const updateSpy = jest.spyOn(controller, 'update' as never);

    triggerTransactionConfirmed(OWNER_ACCOUNTS[0].address);
    await flushPromises();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ACCOUNTS[0].address]: 'mock-grouped-data-1',
      },
    });
    expect(fetchPositionsSpy).toHaveBeenCalled();
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ACCOUNTS[0].address);
    expect(mockFetchPositions).toHaveBeenCalledTimes(1);

    expect(groupPositionsSpy).toHaveBeenCalledWith('mock-fetch-data-1');
    expect(groupPositionsSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
