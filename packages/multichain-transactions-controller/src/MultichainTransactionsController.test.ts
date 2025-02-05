import { Messenger } from '@metamask/base-controller';
import type { CaipAssetType, Transaction } from '@metamask/keyring-api';
import {
  BtcAccountType,
  BtcMethod,
  EthAccountType,
  EthMethod,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipChainId } from '@metamask/utils';
import { v4 as uuidv4 } from 'uuid';

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
    handleRequestReturnValue?: Record<CaipAssetType, Transaction>;
  };
} = {}) => {
  const messenger = new Messenger<AllowedActions, AllowedEvents>();

  const multichainTransactionsControllerMessenger: MultichainTransactionsControllerMessenger =
    messenger.getRestricted({
      name: 'MultichainTransactionsController',
      allowedActions: [
        'SnapController:handleRequest',
        'AccountsController:listMultichainAccounts',
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

  const controller = new MultichainTransactionsController({
    messenger: multichainTransactionsControllerMessenger,
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

    expect(controller.state).toStrictEqual({
      nonEvmTransactions: {
        [mockBtcAccount.id]: {
          transactions: mockTransactionResult.data,
          next: null,
          lastUpdated: expect.any(Number),
        },
      },
    });
  });

  it('updates transactions when "AccountsController:accountRemoved" is fired', async () => {
    const { controller, messenger, mockListMultichainAccounts } =
      setupController();

    await controller.updateTransactionsForAccount(mockBtcAccount.id);
    expect(controller.state).toStrictEqual({
      nonEvmTransactions: {
        [mockBtcAccount.id]: {
          transactions: mockTransactionResult.data,
          next: null,
          lastUpdated: expect.any(Number),
        },
      },
    });

    messenger.publish('AccountsController:accountRemoved', mockBtcAccount.id);
    mockListMultichainAccounts.mockReturnValue([]);

    expect(controller.state).toStrictEqual({
      nonEvmTransactions: {},
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
      nonEvmTransactions: {},
    });
  });

  it('updates transactions for a specific account', async () => {
    const { controller } = setupController();
    await controller.updateTransactionsForAccount(mockBtcAccount.id);

    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
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

  it('updates transactions when receiving accountTransactionsUpdated event', async () => {
    const { controller, messenger } = setupController({
      state: {
        nonEvmTransactions: {
          [mockBtcAccount.id]: {
            transactions: [],
            next: null,
            lastUpdated: Date.now(),
          },
        },
      },
    });
    const transactionUpdate = {
      transactions: {
        [mockBtcAccount.id]: mockTransactionResult.data,
      },
    };

    messenger.publish(
      'AccountsController:accountTransactionsUpdated',
      transactionUpdate,
    );

    await waitForAllPromises();

    expect(
      controller.state.nonEvmTransactions[mockBtcAccount.id],
    ).toStrictEqual({
      transactions: mockTransactionResult.data,
      next: null,
      lastUpdated: expect.any(Number),
    });
  });
});
