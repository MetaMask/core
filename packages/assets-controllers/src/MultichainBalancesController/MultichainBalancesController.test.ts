import { Messenger } from '@metamask/base-controller';
import type {
  AccountAssetListUpdatedEventPayload,
  Balance,
  CaipAssetType,
} from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod,
  BtcScope,
  EthScope,
  SolScope,
  SolMethod,
  SolAccountType,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { v4 as uuidv4 } from 'uuid';

import { MultichainBalancesController } from '.';
import type {
  MultichainBalancesControllerMessenger,
  MultichainBalancesControllerState,
} from '.';
import { getDefaultMultichainBalancesControllerState } from './MultichainBalancesController';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { MultichainAssetsControllerState } from 'src/MultichainAssetsController';

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

const mockSolAccount = {
  address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
  id: uuidv4(),
  metadata: {
    name: 'Solana Account 1',
    importTime: Date.now(),
    keyring: {
      type: KeyringTypes.snap,
    },
    snap: {
      id: 'mock-sol-snap',
      name: 'mock-sol-snap',
      enabled: true,
    },
    lastSelected: 0,
  },
  scopes: [SolScope.Devnet],
  options: {},
  methods: [SolMethod.SendAndConfirmTransaction],
  type: SolAccountType.DataAccount,
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

const mockBtcNativeAsset = 'bip122:000000000933ea01ad0ee984209779ba/slip44:0';
const mockBalanceResult = {
  [mockBtcNativeAsset]: {
    amount: '1.00000000',
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
 * @returns The unrestricted messenger suited for MultichainBalancesController.
 */
function getRootMessenger(): Messenger<RootAction, RootEvent> {
  return new Messenger<RootAction, RootEvent>();
}

/**
 * Constructs the restricted messenger for the MultichainBalancesController.
 *
 * @param messenger - The root messenger.
 * @returns The unrestricted messenger suited for MultichainBalancesController.
 */
function getRestrictedMessenger(
  messenger: Messenger<RootAction, RootEvent>,
): MultichainBalancesControllerMessenger {
  return messenger.getRestricted({
    name: 'MultichainBalancesController',
    allowedActions: [
      'SnapController:handleRequest',
      'AccountsController:listMultichainAccounts',
      'MultichainAssetsController:getState',
      'KeyringController:getState',
    ],
    allowedEvents: [
      'AccountsController:accountAdded',
      'AccountsController:accountRemoved',
      'AccountsController:accountBalancesUpdated',
      // 'MultichainAssetsController:stateChange',
      'AccountsController:accountAssetListUpdated',
    ],
  });
}

const setupController = ({
  state = getDefaultMultichainBalancesControllerState(),
  mocks,
}: {
  state?: MultichainBalancesControllerState;
  mocks?: {
    listMultichainAccounts?: InternalAccount[];
    handleRequestReturnValue?: Record<CaipAssetType, Balance>;
    handleMockGetAssetsState?: {
      accountsAssets: {
        [account: string]: CaipAssetType[];
      };
    };
  };
} = {}) => {
  const messenger = getRootMessenger();
  const multichainBalancesMessenger = getRestrictedMessenger(messenger);

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

  const mockGetAssetsState = jest.fn().mockReturnValue(
    mocks?.handleMockGetAssetsState ?? {
      accountsAssets: {
        [mockBtcAccount.id]: [mockBtcNativeAsset],
      },
    },
  );
  messenger.registerActionHandler(
    'MultichainAssetsController:getState',
    mockGetAssetsState,
  );

  const mockGetKeyringState = jest.fn().mockReturnValue({
    isUnlocked: true,
  });
  messenger.registerActionHandler(
    'KeyringController:getState',
    mockGetKeyringState,
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
    mockGetAssetsState,
    mockGetKeyringState,
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

describe('MultichainBalancesController', () => {
  it('initialize with default state', () => {
    const messenger = getRootMessenger();
    const multichainBalancesMessenger = getRestrictedMessenger(messenger);

    messenger.registerActionHandler('SnapController:handleRequest', jest.fn());
    messenger.registerActionHandler(
      'AccountsController:listMultichainAccounts',
      jest.fn().mockReturnValue([]),
    );
    messenger.registerActionHandler(
      'MultichainAssetsController:getState',
      jest.fn(),
    );
    messenger.registerActionHandler(
      'KeyringController:getState',
      jest.fn().mockReturnValue({ isUnlocked: true }),
    );

    const controller = new MultichainBalancesController({
      messenger: multichainBalancesMessenger,
    });
    expect(controller.state).toStrictEqual({ balances: {} });
  });

  it('updates the balance for a specific account', async () => {
    const { controller } = setupController();
    await controller.updateBalance(mockBtcAccount.id);

    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual(
      mockBalanceResult,
    );
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

  it('handles errors gracefully when account could not be found', async () => {
    const { controller } = setupController({
      mocks: {
        listMultichainAccounts: [],
      },
    });

    await controller.updateBalance(mockBtcAccount.id);
    await waitForAllPromises();

    expect(controller.state.balances).toStrictEqual({});
  });

  it('handles errors when trying to upgrade the balance of a non-existing account', async () => {
    const { controller } = setupController({
      mocks: {
        listMultichainAccounts: [mockBtcAccount],
      },
    });

    // Solana account is not registered, so this should not update anything for this account
    await controller.updateBalance(mockSolAccount.id);
    expect(controller.state.balances).toStrictEqual({});
  });

  it('stores balances when receiving new balances from the "AccountsController:accountBalancesUpdated" event', async () => {
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

  it('updates balances when receiving "AccountsController:accountBalancesUpdated" event', async () => {
    const mockInitialBalances = {
      [mockBtcNativeAsset]: {
        amount: '0.00000000',
        unit: 'BTC',
      },
    };
    // Just to make sure we will run a "true update", we want to make the
    // initial state is different from the updated one.
    expect(mockInitialBalances).not.toStrictEqual(mockBalanceResult);

    const { controller, messenger } = setupController({
      state: {
        balances: {
          [mockBtcAccount.id]: mockInitialBalances,
        },
      },
    });
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

  it('handles an account with no assets in MultichainAssetsController state', async () => {
    const { controller, mockGetAssetsState } = setupController({
      mocks: {
        handleRequestReturnValue: {},
      },
    });

    mockGetAssetsState.mockReturnValue({
      accountsAssets: {},
    });

    await controller.updateBalance(mockBtcAccount.id);

    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual({});
  });

  describe('when AccountsController:accountAssetListUpdated is fired', () => {
    it('updates balances when receiving "AccountsController:accountAssetListUpdated" event and state is empty', async () => {
      const mockListSolanaAccounts = [
        {
          address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
          id: uuidv4(),
          metadata: {
            name: 'Solana Account 1',
            importTime: Date.now(),
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              id: 'mock-sol-snap',
              name: 'mock-sol-snap',
              enabled: true,
            },
            lastSelected: 0,
          },
          scopes: [SolScope.Devnet],
          options: {},
          methods: [SolMethod.SendAndConfirmTransaction],
          type: SolAccountType.DataAccount,
        },
        {
          address: 'GMTYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
          id: uuidv4(),
          metadata: {
            name: 'Solana Account 2',
            importTime: Date.now(),
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              id: 'mock-sol-snap',
              name: 'mock-sol-snap',
              enabled: true,
            },
            lastSelected: 0,
          },
          scopes: [SolScope.Devnet],
          options: {},
          methods: [SolMethod.SendAndConfirmTransaction],
          type: SolAccountType.DataAccount,
        },
      ];

      const mockSolanaAccountId1 = mockListSolanaAccounts[0].id;
      const mockSolanaAccountId2 = mockListSolanaAccounts[1].id;

      const { controller, messenger, mockSnapHandleRequest } = setupController({
        state: {
          balances: {},
        },
        mocks: {
          handleMockGetAssetsState: {
            accountsAssets: {},
          },
          handleRequestReturnValue: {},
          listMultichainAccounts: mockListSolanaAccounts,
        },
      });

      mockSnapHandleRequest.mockReset();
      mockSnapHandleRequest
        .mockResolvedValueOnce({
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
            amount: '1.00000000',
            unit: 'SOL',
          },
        })
        .mockResolvedValueOnce({
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
            amount: '3.00000000',
            unit: 'SOL',
          },
        });

      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId1]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken'],
            removed: [],
          },
          [mockSolanaAccountId2]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3'],
            removed: [],
          },
        },
      };

      messenger.publish(
        'AccountsController:accountAssetListUpdated',
        updatedAssetsList,
      );

      await waitForAllPromises();

      expect(controller.state.balances).toStrictEqual({
        [mockSolanaAccountId1]: {
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
            amount: '1.00000000',
            unit: 'SOL',
          },
        },
        [mockSolanaAccountId2]: {
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
            amount: '3.00000000',
            unit: 'SOL',
          },
        },
      });
    });

    it('updates balances when receiving "AccountsController:accountAssetListUpdated" event and state has existing balances', async () => {
      const mockListSolanaAccounts = [
        {
          address: 'EBBYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
          id: uuidv4(),
          metadata: {
            name: 'Solana Account 1',
            importTime: Date.now(),
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              id: 'mock-sol-snap',
              name: 'mock-sol-snap',
              enabled: true,
            },
            lastSelected: 0,
          },
          scopes: [SolScope.Devnet],
          options: {},
          methods: [SolMethod.SendAndConfirmTransaction],
          type: SolAccountType.DataAccount,
        },
        {
          address: 'GMTYfhQzVzurZiweJ2keeBWpgGLs1cbWYcz28gjGgi5x',
          id: uuidv4(),
          metadata: {
            name: 'Solana Account 2',
            importTime: Date.now(),
            keyring: {
              type: KeyringTypes.snap,
            },
            snap: {
              id: 'mock-sol-snap',
              name: 'mock-sol-snap',
              enabled: true,
            },
            lastSelected: 0,
          },
          scopes: [SolScope.Devnet],
          options: {},
          methods: [SolMethod.SendAndConfirmTransaction],
          type: SolAccountType.DataAccount,
        },
      ];

      const mockSolanaAccountId1 = mockListSolanaAccounts[0].id;
      const mockSolanaAccountId2 = mockListSolanaAccounts[1].id;

      const existingBalancesState = {
        [mockSolanaAccountId1]: {
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken55': {
            amount: '5.00000000',
            unit: 'SOL',
          },
        },
      };
      const {
        controller,
        messenger,
        mockSnapHandleRequest,
        mockListMultichainAccounts,
      } = setupController({
        state: {
          balances: existingBalancesState,
        },
        mocks: {
          handleMockGetAssetsState: {
            accountsAssets: {
              [mockSolanaAccountId1]: [
                'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken55',
              ],
            },
          },
          handleRequestReturnValue: {
            'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken55': {
              amount: '55.00000000',
              unit: 'SOL',
            },
          },
          listMultichainAccounts: [mockListSolanaAccounts[0]],
        },
      });

      mockSnapHandleRequest.mockReset();
      mockListMultichainAccounts.mockReset();

      mockListMultichainAccounts.mockReturnValue(mockListSolanaAccounts);
      mockSnapHandleRequest
        .mockResolvedValueOnce({
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
            amount: '1.00000000',
            unit: 'SOL',
          },
        })
        .mockResolvedValueOnce({
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
            amount: '3.00000000',
            unit: 'SOL',
          },
        });

      const updatedAssetsList: AccountAssetListUpdatedEventPayload = {
        assets: {
          [mockSolanaAccountId1]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken'],
            removed: [],
          },
          [mockSolanaAccountId2]: {
            added: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3'],
            removed: [],
          },
        },
      };

      messenger.publish(
        'AccountsController:accountAssetListUpdated',
        updatedAssetsList,
      );

      await waitForAllPromises();

      expect(controller.state.balances).toStrictEqual({
        [mockSolanaAccountId1]: {
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken': {
            amount: '1.00000000',
            unit: 'SOL',
          },
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken55': {
            amount: '55.00000000',
            unit: 'SOL',
          },
        },
        [mockSolanaAccountId2]: {
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:newToken3': {
            amount: '3.00000000',
            unit: 'SOL',
          },
        },
      });
    });
  });

  it('resumes updating balances after unlocking KeyringController', async () => {
    const { controller, mockGetKeyringState } = setupController();

    mockGetKeyringState.mockReturnValue({ isUnlocked: false });

    await controller.updateBalance(mockBtcAccount.id);
    expect(controller.state.balances[mockBtcAccount.id]).toBeUndefined();

    mockGetKeyringState.mockReturnValue({ isUnlocked: true });

    await controller.updateBalance(mockBtcAccount.id);
    expect(controller.state.balances[mockBtcAccount.id]).toStrictEqual(
      mockBalanceResult,
    );
  });
});
