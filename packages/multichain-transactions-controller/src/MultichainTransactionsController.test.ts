import { Messenger } from '@metamask/base-controller';
import type {
  AccountTransactionsUpdatedEventPayload,
  CaipAssetType,
  TransactionsPage,
} from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod,
  SolAccountType,
  SolMethod,
  SolScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipChainId } from '@metamask/utils';
import { v4 as uuidv4 } from 'uuid';

import { MultichainNetwork } from './constants';
import {
  MultichainTransactionsController,
  getDefaultMultichainTransactionsControllerState,
  type AllowedActions,
  type AllowedEvents,
  type MultichainTransactionsControllerState,
  type MultichainTransactionsControllerMessenger,
} from './MultichainTransactionsController';

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
  options: {},
  methods: [BtcMethod.SendBitcoin],
  type: BtcAccountType.P2wpkh,
  scopes: [],
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
  options: {},
  methods: [EthMethod.SignTypedDataV4, EthMethod.SignTransaction],
  type: EthAccountType.Eoa,
  scopes: [],
};

const mockTransactionResult = {
  data: [
    {
      id: '123',
      account: mockBtcAccount.id,
      chain: 'bip122:000000000019d6689c085ae165831e93' as CaipChainId,
      type: 'send' as const,
      status: 'confirmed' as const,
      timestamp: Date.now(),
      from: [{ address: 'from-address', asset: null }],
      to: [{ address: 'to-address', asset: null }],
      fees: [
        {
          type: 'base' as const,
          asset: {
            unit: 'BTC',
            type: 'bip122:000000000019d6689c085ae165831e93/slip44:0' as CaipAssetType,
            amount: '1000',
            fungible: true as const,
          },
        },
      ],
      events: [
        {
          status: 'confirmed' as const,
          timestamp: Date.now(),
        },
      ],
    },
  ],
  next: null,
};

const setupController = ({
  state = getDefaultMultichainTransactionsControllerState(),
  mocks,
}: {
  state?: MultichainTransactionsControllerState;
  mocks?: {
    listMultichainAccounts?: InternalAccount[];
    handleRequestReturnValue?: TransactionsPage;
  };
} = {}) => {
  const messenger = new Messenger<AllowedActions, AllowedEvents>();

  const multichainTransactionsControllerMessenger: MultichainTransactionsControllerMessenger =
    messenger.getRestricted({
      name: 'MultichainTransactionsController',
      allowedActions: [
        'SnapController:handleRequest',
        'AccountsController:listMultichainAccounts',
        'KeyringController:getState',
      ],
      allowedEvents: [
        'AccountsController:accountAdded',
        'AccountsController:accountRemoved',
        'AccountsController:accountTransactionsUpdated',
      ],
    });

  const mockSnapHandleRequest = jest.fn();
  messenger.registerActionHandler(
    'SnapController:handleRequest',
    mockSnapHandleRequest.mockReturnValue(
      mocks?.handleRequestReturnValue ?? mockTransactionResult,
    ),
  );

  const mockListMultichainAccounts = jest.fn();
  messenger.registerActionHandler(
    'AccountsController:listMultichainAccounts',
    mockListMultichainAccounts.mockReturnValue(
      mocks?.listMultichainAccounts ?? [mockBtcAccount, mockEthAccount],
    ),
  );

  const mockGetKeyringState = jest.fn().mockReturnValue({
    isUnlocked: true,
  });
  messenger.registerActionHandler(
    'KeyringController:getState',
    mockGetKeyringState,
  );

  const controller = new MultichainTransactionsController({
    messenger: multichainTransactionsControllerMessenger,
    state,
  });

  return {
    controller,
    messenger,
    mockSnapHandleRequest,
    mockListMultichainAccounts,
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

const NEW_ACCOUNT_ID = 'new-account-id';
const TEST_ACCOUNT_ID = 'test-account-id';

describe('MultichainTransactionsController', () => {
  it('initialize with default state', () => {
    const { controller } = setupController({});
    expect(controller.state).toStrictEqual({ nonEvmTransactions: {} });
  });

  it('updates transactions when "AccountsController:accountAdded" is fired', async () => {
    const { controller, messenger, mockListMultichainAccounts } =
      setupController({
        mocks: {
          listMultichainAccounts: [],
        },
      });

    mockListMultichainAccounts.mockReturnValue([mockBtcAccount]);
    messenger.publish('AccountsController:accountAdded', mockBtcAccount);

    await waitForAllPromises();

    const chain = mockTransactionResult.data[0].chain;
    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id][chain],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
  });

  it('updates transactions when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger, mockListMultichainAccounts } =
      setupController();

    await controller.updateTransactionsForAccount(mockBtcAccount.id);

    const chain = mockTransactionResult.data[0].chain;
    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id][chain],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });

    messenger.publish('AccountsController:accountRemoved', mockBtcAccount.id);
    mockListMultichainAccounts.mockReturnValue([]);

    expect(controller.state.nonEvmTransactions).toStrictEqual({});
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
      nonEvmTransactions: {},
    });
  });

  it('updates transactions for a specific account', async () => {
    const { controller } = setupController();
    await controller.updateTransactionsForAccount(mockBtcAccount.id);

    const chain = mockTransactionResult.data[0].chain;
    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id][chain],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
  });

  it('stores transactions by chain for accounts', async () => {
    const mockSolTransaction = {
      account: mockSolAccount.id,
      type: 'send' as const,
      status: 'confirmed' as const,
      timestamp: Date.now(),
      from: [],
      to: [],
      fees: [],
      events: [
        {
          status: 'confirmed' as const,
          timestamp: Date.now(),
        },
      ],
    };
    const mockSolTransactions = {
      data: [
        {
          ...mockSolTransaction,
          id: '3',
          chain: MultichainNetwork.Solana,
        },
        {
          ...mockSolTransaction,
          id: '1',
          chain: MultichainNetwork.SolanaTestnet,
        },
        {
          ...mockSolTransaction,
          id: '2',
          chain: MultichainNetwork.SolanaDevnet,
        },
      ],
      next: null,
    };

    const { controller, mockSnapHandleRequest } = setupController({
      mocks: {
        listMultichainAccounts: [mockSolAccount],
      },
    });
    mockSnapHandleRequest.mockReturnValueOnce(mockSolTransactions);

    await controller.updateTransactionsForAccount(mockSolAccount.id);

    expect(
      Object.keys(controller.state.nonEvmTransactions[mockSolAccount.id]),
    ).toHaveLength(4);

    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.Solana
      ].transactions,
    ).toHaveLength(1);
    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.Solana
      ].transactions[0],
    ).toStrictEqual(mockSolTransactions.data[0]);

    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.SolanaTestnet
      ].transactions,
    ).toHaveLength(1);
    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.SolanaTestnet
      ].transactions[0],
    ).toStrictEqual(mockSolTransactions.data[1]);

    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.SolanaDevnet
      ].transactions,
    ).toHaveLength(1);
    expect(
      controller.state.nonEvmTransactions[mockSolAccount.id][
        MultichainNetwork.SolanaDevnet
      ].transactions[0],
    ).toStrictEqual(mockSolTransactions.data[2]);
  });

  it('handles pagination when fetching transactions', async () => {
    const firstPage = {
      data: [
        {
          id: '1',
          account: mockBtcAccount.id,
          chain: 'bip122:000000000933ea01ad0ee984209779ba',
          type: 'send' as const,
          status: 'confirmed' as const,
          timestamp: Date.now(),
          from: [],
          to: [],
          fees: [],
          events: [
            {
              status: 'confirmed' as const,
              timestamp: Date.now(),
            },
          ],
        },
      ],
      next: 'page2',
    };

    const secondPage = {
      data: [
        {
          id: '2',
          account: mockBtcAccount.id,
          chain: 'bip122:000000000933ea01ad0ee984209779ba',
          type: 'send' as const,
          status: 'confirmed' as const,
          timestamp: Date.now(),
          from: [],
          to: [],
          fees: [],
          events: [
            {
              status: 'confirmed' as const,
              timestamp: Date.now(),
            },
          ],
        },
      ],
      next: null,
    };

    const { controller, mockSnapHandleRequest } = setupController();
    mockSnapHandleRequest
      .mockReturnValueOnce(firstPage)
      .mockReturnValueOnce(secondPage);

    await controller.updateTransactionsForAccount(mockBtcAccount.id);

    expect(mockSnapHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: 'keyring_listAccountTransactions',
        }),
      }),
    );
  });

  it('handles errors gracefully when updating transactions', async () => {
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

    await controller.updateTransactionsForAccount(mockBtcAccount.id);
    await waitForAllPromises();

    expect(controller.state.nonEvmTransactions).toStrictEqual({});
  });

  it('handles errors gracefully when constructing the controller', async () => {
    // This method will be used in the constructor of that controller.
    const updateTransactionsForAccountSpy = jest.spyOn(
      MultichainTransactionsController.prototype,
      'updateTransactionsForAccount',
    );
    updateTransactionsForAccountSpy.mockRejectedValue(
      new Error('Something unexpected happen'),
    );

    const { controller } = setupController({
      mocks: {
        listMultichainAccounts: [mockBtcAccount],
      },
    });

    expect(controller.state.nonEvmTransactions).toStrictEqual({});
  });

  it('updates transactions when receiving "AccountsController:accountTransactionsUpdated" event', async () => {
    const mockSolAccountWithId = {
      ...mockSolAccount,
      id: TEST_ACCOUNT_ID,
    };

    const chain = mockTransactionResult.data[0].chain;
    const existingTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      status: 'confirmed' as const,
      chain,
    };

    const newTransaction = {
      ...mockTransactionResult.data[0],
      id: '456',
      status: 'submitted' as const,
      chain,
    };

    const updatedExistingTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      status: 'failed' as const,
      chain,
    };

    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [mockSolAccountWithId.id]: {
            [chain]: {
              transactions: [existingTransaction],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockSolAccountWithId.id]: [updatedExistingTransaction, newTransaction],
      },
    });

    await waitForAllPromises();

    const finalTransactions =
      controller.state.nonEvmTransactions[mockSolAccountWithId.id][chain]
        .transactions;
    expect(finalTransactions).toStrictEqual([
      updatedExistingTransaction,
      newTransaction,
    ]);
  });

  it('handles empty transaction updates gracefully', async () => {
    const chain = mockTransactionResult.data[0].chain;
    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [TEST_ACCOUNT_ID]: {
            [chain]: {
              transactions: [],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {},
    });

    await waitForAllPromises();

    expect(
      controller.state.nonEvmTransactions[TEST_ACCOUNT_ID][chain],
    ).toStrictEqual({
      transactions: [],
      next: null,
      lastUpdated: expect.any(Number),
    });
  });

  it('initializes new accounts with empty transactions array when receiving updates', async () => {
    const chain = mockTransactionResult.data[0].chain;

    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {},
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [NEW_ACCOUNT_ID]: mockTransactionResult.data,
      },
    });

    await waitForAllPromises();
    expect(
      controller.state.nonEvmTransactions[NEW_ACCOUNT_ID][chain],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
  });

  it('handles undefined transactions in update payload', async () => {
    const chain = mockTransactionResult.data[0].chain;
    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [TEST_ACCOUNT_ID]: {
            [chain]: {
              transactions: [],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
      mocks: {
        listMultichainAccounts: [],
        handleRequestReturnValue: {
          data: [],
          next: null,
        },
      },
    });

    const initialStateSnapshot = {
      [TEST_ACCOUNT_ID]: {
        [chain]: {
          ...controller.state.nonEvmTransactions[TEST_ACCOUNT_ID][chain],
          lastUpdated: expect.any(Number),
        },
      },
    };

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: undefined,
    } as unknown as AccountTransactionsUpdatedEventPayload);

    await waitForAllPromises();

    expect(controller.state.nonEvmTransactions).toStrictEqual(
      initialStateSnapshot,
    );
  });

  it('sorts transactions by timestamp (newest first)', async () => {
    const chain = mockTransactionResult.data[0].chain;
    const olderTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      timestamp: 1000,
    };
    const newerTransaction = {
      ...mockTransactionResult.data[0],
      id: '456',
      timestamp: 2000,
    };

    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [TEST_ACCOUNT_ID]: {
            [chain]: {
              transactions: [olderTransaction],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [TEST_ACCOUNT_ID]: [newerTransaction],
      },
    });

    await waitForAllPromises();

    const finalTransactions =
      controller.state.nonEvmTransactions[TEST_ACCOUNT_ID][chain].transactions;
    expect(finalTransactions).toStrictEqual([
      newerTransaction,
      olderTransaction,
    ]);
  });

  it('sorts transactions by timestamp and handles null timestamps', async () => {
    const chain = mockTransactionResult.data[0].chain;
    const nullTimestampTx1 = {
      ...mockTransactionResult.data[0],
      id: '123',
      timestamp: null,
    };
    const nullTimestampTx2 = {
      ...mockTransactionResult.data[0],
      id: '456',
      timestamp: null,
    };
    const withTimestampTx = {
      ...mockTransactionResult.data[0],
      id: '789',
      timestamp: 1000,
    };

    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [TEST_ACCOUNT_ID]: {
            [chain]: {
              transactions: [nullTimestampTx1],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [TEST_ACCOUNT_ID]: [withTimestampTx, nullTimestampTx2],
      },
    });

    await waitForAllPromises();

    const finalTransactions =
      controller.state.nonEvmTransactions[TEST_ACCOUNT_ID][chain].transactions;
    expect(finalTransactions).toStrictEqual([
      withTimestampTx,
      nullTimestampTx1,
      nullTimestampTx2,
    ]);
  });

  it('resumes updating transactions after unlocking KeyringController', async () => {
    const { controller, mockGetKeyringState } = setupController();

    mockGetKeyringState.mockReturnValue({ isUnlocked: false });

    await controller.updateTransactionsForAccount(mockBtcAccount.id);
    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id],
    ).toBeUndefined();

    mockGetKeyringState.mockReturnValue({ isUnlocked: true });

    await controller.updateTransactionsForAccount(mockBtcAccount.id);

    const chain = mockTransactionResult.data[0].chain;
    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id][chain],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
  });

  it('updates transactions by chain when receiving transaction updates', async () => {
    const mockSolAccountWithId = {
      ...mockSolAccount,
      id: TEST_ACCOUNT_ID,
    };

    const mockSolTransaction = {
      type: 'send' as const,
      status: 'confirmed' as const,
      timestamp: Date.now(),
      from: [],
      to: [],
      fees: [],
      account: mockSolAccountWithId.id,
      events: [
        {
          status: 'confirmed' as const,
          timestamp: Date.now(),
        },
      ],
    };

    const mainnetTransaction = {
      ...mockSolTransaction,
      id: '1',
      chain: MultichainNetwork.Solana,
    };

    const devnetTransaction = {
      ...mockSolTransaction,
      id: '2',
      chain: MultichainNetwork.SolanaDevnet,
    };

    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [mockSolAccountWithId.id]: {
            [MultichainNetwork.Solana]: {
              transactions: [],
              next: null,
              lastUpdated: Date.now(),
            },
          },
        },
      },
    });

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockSolAccountWithId.id]: [mainnetTransaction, devnetTransaction],
      },
    });

    await waitForAllPromises();

    expect(
      Object.keys(controller.state.nonEvmTransactions[mockSolAccountWithId.id]),
    ).toHaveLength(2);

    expect(
      controller.state.nonEvmTransactions[mockSolAccountWithId.id][
        MultichainNetwork.Solana
      ].transactions,
    ).toHaveLength(1);
    expect(
      controller.state.nonEvmTransactions[mockSolAccountWithId.id][
        MultichainNetwork.Solana
      ].transactions[0],
    ).toBe(mainnetTransaction);

    expect(
      controller.state.nonEvmTransactions[mockSolAccountWithId.id][
        MultichainNetwork.SolanaDevnet
      ].transactions,
    ).toHaveLength(1);
    expect(
      controller.state.nonEvmTransactions[mockSolAccountWithId.id][
        MultichainNetwork.SolanaDevnet
      ].transactions[0],
    ).toBe(devnetTransaction);
  });

  it('publishes transactionConfirmed event when transaction is confirmed', async () => {
    const { messenger } = setupController();

    const confirmedTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      status: 'confirmed' as const,
    };

    const publishSpy = jest.spyOn(messenger, 'publish');

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockBtcAccount.id]: [confirmedTransaction],
      },
    });

    await waitForAllPromises();

    expect(publishSpy).toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionConfirmed',
      confirmedTransaction,
    );
  });

  it('publishes transactionSubmitted event when transaction is submitted', async () => {
    const { messenger } = setupController();

    const submittedTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      status: 'submitted' as const,
    };

    const publishSpy = jest.spyOn(messenger, 'publish');

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockBtcAccount.id]: [submittedTransaction],
      },
    });

    await waitForAllPromises();

    expect(publishSpy).toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionSubmitted',
      submittedTransaction,
    );
  });

  it('does not publish events for other transaction statuses', async () => {
    const { messenger } = setupController();

    const pendingTransaction = {
      ...mockTransactionResult.data[0],
      id: '123',
      status: 'unconfirmed' as const,
    };

    const publishSpy = jest.spyOn(messenger, 'publish');

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockBtcAccount.id]: [pendingTransaction],
      },
    });

    await waitForAllPromises();

    expect(publishSpy).not.toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionConfirmed',
      expect.anything(),
    );
    expect(publishSpy).not.toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionSubmitted',
      expect.anything(),
    );
  });

  it('publishes correct events for multiple transactions with different statuses', async () => {
    const { messenger } = setupController();

    const transactions = [
      {
        ...mockTransactionResult.data[0],
        id: '123',
        status: 'confirmed' as const,
      },
      {
        ...mockTransactionResult.data[0],
        id: '456',
        status: 'submitted' as const,
      },
      {
        ...mockTransactionResult.data[0],
        id: '789',
        status: 'unconfirmed' as const,
      },
    ];

    const publishSpy = jest.spyOn(messenger, 'publish');

    messenger.publish('AccountsController:accountTransactionsUpdated', {
      transactions: {
        [mockBtcAccount.id]: transactions,
      },
    });

    await waitForAllPromises();

    expect(publishSpy).toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionConfirmed',
      transactions[0],
    );
    expect(publishSpy).toHaveBeenCalledWith(
      'MultichainTransactionsController:transactionSubmitted',
      transactions[1],
    );
  });
});
