import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Hex } from '@metamask/utils';

import type {
  DeFiPositionsControllerMessenger,
  DeFiPositionsControllerState,
} from './DeFiPositionsController';
import { DeFiPositionsController } from './DeFiPositionsController';
import * as fetchPositions from './fetch-positions';
import type { DefiPositionResponse } from './fetch-positions';
import * as groupPositions from './group-positions';
import type { GroupedPositions } from './group-positions';
import { createMockInternalAccount } from '../../../accounts-controller/src/tests/mocks';
import { Messenger } from '../../../base-controller/src/Messenger';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
import type { NetworkState } from '../../../network-controller/src/NetworkController';

const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';
const OWNER_ID = '54d1e7bc-1dce-4220-a15f-2f454bae7869';
const OWNER_ACCOUNT = createMockInternalAccount({
  id: OWNER_ID,
  address: OWNER_ADDRESS,
});

type MainMessenger = Messenger<
  ExtractAvailableAction<DeFiPositionsControllerMessenger>,
  ExtractAvailableEvent<DeFiPositionsControllerMessenger>
>;

/**
 *
 * @param state - Partial state to initialize the controller with
 * @returns The controller instance and the trigger functions
 */
function setupController(state?: Partial<DeFiPositionsControllerState>) {
  const messenger: MainMessenger = new Messenger();

  const mockGetAccount = jest.fn().mockReturnValue(OWNER_ACCOUNT);
  messenger.registerActionHandler(
    'AccountsController:getAccount',
    mockGetAccount,
  );

  const mockGetSelectedAccount = jest.fn().mockReturnValue(OWNER_ACCOUNT);
  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );

  const restrictedMessenger = messenger.getRestricted({
    name: 'DeFiPositionsController',
    allowedActions: [
      'AccountsController:getSelectedAccount',
      'AccountsController:getAccount',
    ],
    allowedEvents: [
      'AccountsController:selectedAccountChange',
      'NetworkController:stateChange',
    ],
  });

  const controller = new DeFiPositionsController({
    messenger: restrictedMessenger,
    state,
  });

  const triggerSelectedAccountChange = (
    internalAccount: InternalAccount,
  ): void => {
    messenger.publish(
      'AccountsController:selectedAccountChange',
      internalAccount,
    );
  };

  const triggerNetworkChange = (): void => {
    messenger.publish('NetworkController:stateChange', {} as NetworkState, []);
  };

  return {
    controller,
    triggerSelectedAccountChange,
    triggerNetworkChange,
  };
}

describe('DeFiPositionsController', () => {
  it('sets default state', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {},
    });
  });

  it('sets initial state', () => {
    const initialState = {
      allDeFiPositions: {
        [OWNER_ADDRESS]: {
          '0x1': {
            aggregatedMarketValue: 0,
            protocols: {},
          },
        },
      },
    };

    const { controller } = setupController(initialState);

    expect(controller.state).toStrictEqual(initialState);
  });

  it('updates positions when selected account changes', async () => {
    const mockFetchPositionsResponse =
      'mock-data' as unknown as DefiPositionResponse[];
    const mockFetchPositions = jest
      .fn()
      .mockResolvedValue(mockFetchPositionsResponse);

    const mockGroupPositionsResult = 'mock-grouped-data' as unknown as {
      [key: Hex]: GroupedPositions;
    };

    const fetchPositionsSpy = jest
      .spyOn(fetchPositions, 'buildPositionFetcher')
      .mockReturnValue(mockFetchPositions);

    const groupPositionsSpy = jest
      .spyOn(groupPositions, 'groupPositions')
      .mockReturnValue(mockGroupPositionsResult);

    const { controller, triggerSelectedAccountChange } = setupController();
    const updateSpy = jest.spyOn(controller, 'update' as never);

    triggerSelectedAccountChange(OWNER_ACCOUNT);

    await new Promise(process.nextTick);

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ADDRESS]: mockGroupPositionsResult,
      },
    });
    expect(fetchPositionsSpy).toHaveBeenCalled();
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ADDRESS);
    expect(groupPositionsSpy).toHaveBeenCalledWith(mockFetchPositionsResponse);
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  it('updates positions when network state changes', async () => {
    const mockFetchPositionsResponse =
      'mock-data' as unknown as DefiPositionResponse[];
    const mockFetchPositions = jest
      .fn()
      .mockResolvedValue(mockFetchPositionsResponse);
    const mockGroupPositionsResult = 'mock-grouped-data' as unknown as {
      [key: Hex]: GroupedPositions;
    };

    const fetchPositionsSpy = jest
      .spyOn(fetchPositions, 'buildPositionFetcher')
      .mockReturnValue(mockFetchPositions);
    const groupPositionsSpy = jest
      .spyOn(groupPositions, 'groupPositions')
      .mockReturnValue(mockGroupPositionsResult);

    const { controller, triggerNetworkChange } = setupController();
    const updateSpy = jest.spyOn(controller, 'update' as never);

    triggerNetworkChange();

    await new Promise(process.nextTick);

    expect(controller.state).toStrictEqual({
      allDeFiPositions: {
        [OWNER_ADDRESS]: mockGroupPositionsResult,
      },
    });
    expect(fetchPositionsSpy).toHaveBeenCalled();
    expect(mockFetchPositions).toHaveBeenCalledWith(OWNER_ADDRESS);
    expect(groupPositionsSpy).toHaveBeenCalledWith(mockFetchPositionsResponse);
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });
});
