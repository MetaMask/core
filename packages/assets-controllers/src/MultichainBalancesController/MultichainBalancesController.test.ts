import { Messenger } from '@metamask/base-controller';
import type { Balance, CaipAssetType } from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod,
  BtcScope,
  EthScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { v4 as uuidv4 } from 'uuid';

import {
  MultichainBalancesController,
  getDefaultMultichainBalancesControllerState,
} from './MultichainBalancesController';
import type {
  MultichainBalancesControllerMessenger,
  MultichainBalancesControllerState,
} from './MultichainBalancesController';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';

const mockBtcAccount = {
  address: 'bc1qssdcp5kvwh6nghzg9tuk99xsflwkdv4hgvq58q',
  id: uuidv4(),
  metadata: {
    name: 'Bitcoin Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-btc-snap',
      name: 'mock-btc-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  scopes: [BtcScope.Testnet],
  options: {},
  methods: [BtcMethod.SendBitcoin],
  type: BtcAccountType.P2wpkh,
};

const mockEthAccount = {
  address: '0x807dE1cf8f39E83258904b2f7b473E5C506E4aC1',
  id: uuidv4(),
  metadata: {
    name: 'Ethereum Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-eth-snap',
      name: 'mock-eth-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  scopes: [EthScope.Eoa],
  options: {},
  methods: [EthMethod.SignTypedDataV4, EthMethod.SignTransaction],
  type: EthAccountType.Eoa,
};

const mockBalanceResult = {
  'bip122:000000000933ea01ad0ee984209779ba/slip44:0': {
    amount: '0.00000000',
    unit: 'BTC',
  },
};

/**
 * The union of actions that the root messenger allows.
 */
type RootAction = ExtractAvailableAction<MultichainBalancesControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<MultichainBalancesControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @returns The unrestricted messenger suited for PetNamesController.
 */
function getRootMessenger(): Messenger<RootAction, RootEvent> {
  return new Messenger<RootAction, RootEvent>();
}

const setupController = ({
  state = getDefaultMultichainBalancesControllerState(),
  mocks,
}: {
  state?: MultichainBalancesControllerState;
  mocks?: {
    listMultichainAccounts?: InternalAccount[];
    handleRequestReturnValue?: Record<CaipAssetType, Balance>;
  };
} = {}) => {
  const messenger = getRootMessenger();

  const multichainBalancesMessenger: MultichainBalancesControllerMessenger =
    messenger.getRestricted({
      name: 'MultichainBalancesController',
      allowedActions: [
        'SnapController:handleRequest',
        'AccountsController:listMultichainAccounts',
      ],
      allowedEvents: [
        'AccountsController:accountAdded',
        'AccountsController:accountRemoved',
        'AccountsController:accountBalancesUpdated',
      ],
    });

  const mockSnapHandleRequest = jest.fn();
  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mockSnapHandleRequest.mockReturnValue(
      mocks?.handleRequestReturnValue ?? mockBalanceResult,
    ),
  );

  const mockListMultichainAccounts = jest.fn();
  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    mockListMultichainAccounts.mockReturnValue(
      mocks?.listMultichainAccounts ?? [mockBtcAccount, mockEthAccount],
    ),
  );

  const controller = new MultichainBalancesController({
    messenger: multichainBalancesMessenger,
    state,
  });

  return {
    controller,
    messenger,
    mockSnapHandleRequest,
    mockListMultichainAccounts,
  };
};

/**
 * Utility function that waits for all pending promises to be resolved.
 * This is necessary when testing asynchronous execution flows that are
 * initiated by synchronous calls.
 *
 * @returns A promise that resolves when all pending promises are completed.
 */
async function waitForAllPromises(): Promise<void> {
  // Wait for next tick to flush all pending promises. It's requires since
  // we are testing some asynchronous execution flows that are started by
  // synchronous calls.
  await new Promise(process.nextTick);
}

describe('BalancesController', () => {
  it('initialize with default state', () => {
    const { controller } = setupController({});
    expect(controller.state).toStrictEqual({ balances: {} });
  });

  it('updates the balance for a specific account', async () => {
    const { controller } = setupController();
    await controller.updateBalance(mockBtcAccount.id);

    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual(
      mockBalanceResult,
    );
  });

  it('updates balances when "AccountsController:accountAdded" is fired', async () => {
    const { controller, messenger, mockListMultichainAccounts } =
      setupController({
        mocks: {
          listMultichainAccounts: [],
        },
      });

    mockListMultichainAccounts.mockReturnValue([mockBtcAccount]);
    messenger.publish('AccountsController:accountAdded', mockBtcAccount);

    await waitForAllPromises();

    expect(controller.state).toStrictEqual({
      balances: {
        [mockBtcAccount.id]: mockBalanceResult,
      },
    });
  });

  it('updates balances when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger } = setupController();

    await controller.updateBalance(mockBtcAccount.id);
    expect(controller.state).toStrictEqual({
      balances: {
        [mockBtcAccount.id]: mockBalanceResult,
      },
    });

    messenger.publish('AccountsController:accountRemoved', mockBtcAccount.id);

    expect(controller.state).toStrictEqual({
      balances: {},
    });
  });

  it('does not track balances for EVM accounts', async () => {
    const { controller, messenger, mockListMultichainAccounts } =
      setupController({
        mocks: {
          listMultichainAccounts: [],
        },
      });

    mockListMultichainAccounts.mockReturnValue([mockEthAccount]);
    messenger.publish('AccountsController:accountAdded', mockEthAccount);

    expect(controller.state).toStrictEqual({
      balances: {},
    });
  });

  it('handles errors gracefully when updating balance', async () => {
    const { controller, mockSnapHandleRequest, mockListMultichainAccounts } =
      setupController({
        mocks: {
          listMultichainAccounts: [],
        },
      });

    mockSnapHandleRequest.mockReset();
    mockSnapHandleRequest.mockImplementation(() =>
      Promise.reject(new Error('Failed to fetch')),
    );
    mockListMultichainAccounts.mockReturnValue([mockBtcAccount]);

    await controller.updateBalance(mockBtcAccount.id);
    await waitForAllPromises();

    expect(controller.state.balances).toStrictEqual({});
  });

  it('updates balances when receiving accountBalancesUpdated event', async () => {
    const { controller, messenger } = setupController();
    const balanceUpdate = {
      balances: {
        [mockBtcAccount.id]: mockBalanceResult,
      },
    };

    messenger.publish(
      'AccountsController:accountBalancesUpdated',
      balanceUpdate,
    );

    await waitForAllPromises();

    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual(
      mockBalanceResult,
    );
  });

  it('fetches initial balances for existing non-EVM accounts', async () => {
    const { controller } = setupController({
      mocks: {
        listMultichainAccounts: [mockBtcAccount],
      },
    });

    await waitForAllPromises();

    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual(
      mockBalanceResult,
    );
  });
});
