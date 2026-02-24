import type {
  Transaction as AccountActivityTransaction,
  WebSocketConnectionInfo,
} from '@metamask/core-backend';
import type { Hex } from '@metamask/utils';

import { SUPPORTED_CHAIN_IDS } from './AccountsApiRemoteTransactionSource';
import {
  IncomingTransactionHelper,
  WebSocketState,
} from './IncomingTransactionHelper';
import type { TransactionControllerMessenger } from '..';
import { flushPromises } from '../../../../tests/helpers';
import { TransactionStatus, TransactionType } from '../types';
import type { RemoteTransactionSource, TransactionMeta } from '../types';
import {
  getIncomingTransactionsPollingInterval,
  isIncomingTransactionsUseBackendWebSocketServiceEnabled,
} from '../utils/feature-flags';

jest.useFakeTimers();

jest.mock('../utils/feature-flags');

// eslint-disable-next-line jest/prefer-spy-on
console.error = jest.fn();

const ADDRESS_MOCK = '0x1';
const SYSTEM_TIME_MOCK = 1000 * 60 * 60 * 24 * 2;
const MESSENGER_MOCK = {
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
} as unknown as TransactionControllerMessenger;
const TAG_MOCK = 'test1';
const TAG_2_MOCK = 'test2';
const CLIENT_MOCK = 'test-client';

const CONTROLLER_ARGS_MOCK: ConstructorParameters<
  typeof IncomingTransactionHelper
>[0] = {
  getCurrentAccount: () => {
    return {
      id: '58def058-d35f-49a1-a7ab-e2580565f6f5',
      address: ADDRESS_MOCK,
      type: 'eip155:eoa' as const,
      options: {},
      methods: [],
      scopes: ['eip155:0'],
      metadata: {
        name: 'Account 1',
        keyring: { type: 'HD Key Tree' },
        importTime: 1631619180000,
        lastSelected: 1631619180000,
      },
    };
  },
  getLocalTransactions: () => [],
  messenger: MESSENGER_MOCK,
  remoteTransactionSource: {} as RemoteTransactionSource,
  trimTransactions: (transactions) => transactions,
};

const TRANSACTION_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x1',
  hash: '0x1',
  status: TransactionStatus.submitted,
  time: 0,
  txParams: { from: '0x2', to: '0x1', gasUsed: '0x1' },
} as unknown as TransactionMeta;

const TRANSACTION_MOCK_2: TransactionMeta = {
  id: '2',
  hash: '0x2',
  chainId: '0x1',
  time: 1,
  txParams: { from: '0x3', to: '0x1' },
} as unknown as TransactionMeta;

const createRemoteTransactionSourceMock = (
  remoteTransactions: TransactionMeta[],
  {
    chainIds,
    error,
  }: {
    chainIds?: Hex[];
    error?: boolean;
  } = {},
): RemoteTransactionSource => ({
  getSupportedChains: jest.fn(() => chainIds ?? SUPPORTED_CHAIN_IDS),
  fetchTransactions: jest.fn(() =>
    error
      ? Promise.reject(new Error('Test Error'))
      : Promise.resolve(remoteTransactions),
  ),
});

/**
 * Emulate running the interval.
 *
 * @param helper - The instance of IncomingTransactionHelper to use.
 * @param options - The options.
 * @param options.start - Whether to start the helper.
 * @param options.error - Whether to simulate an error in the incoming-transactions listener.
 * @returns The event data and listeners.
 */
async function runInterval(
  helper: IncomingTransactionHelper,
  { start, error }: { start?: boolean; error?: boolean } = {},
): Promise<{
  transactions: TransactionMeta[];
  incomingTransactionsListener: jest.Mock;
}> {
  const incomingTransactionsListener = jest.fn();

  if (error) {
    incomingTransactionsListener.mockImplementation(() => {
      throw new Error('Test Error');
    });
  }

  helper.hub.addListener('transactions', incomingTransactionsListener);

  if (start !== false) {
    helper.start();
  }

  jest.runOnlyPendingTimers();

  await flushPromises();

  return {
    transactions: incomingTransactionsListener.mock.calls[0]?.[0],
    incomingTransactionsListener,
  };
}

const MAINNET_CAIP2 = 'eip155:1';
const POLYGON_CAIP2 = 'eip155:137';

// Helper to convert hex chain ID to CAIP-2 format
const hexToCaip2 = (hexChainId: string): string => {
  const decimal = parseInt(hexChainId, 16);
  return `eip155:${decimal}`;
};

// Convert all supported hex chain IDs to CAIP-2 format for testing
const SUPPORTED_CAIP2_CHAINS = SUPPORTED_CHAIN_IDS.map(hexToCaip2);

let statusChangedHandler: (event: {
  chainIds: string[];
  status: 'up' | 'down';
}) => void;

function createMessengerMockWithStatusChanged(): TransactionControllerMessenger {
  const localSubscribeMock = jest.fn().mockImplementation((event, handler) => {
    if (event === 'AccountActivityService:statusChanged') {
      statusChangedHandler = handler;
    }
  });

  return {
    subscribe: localSubscribeMock,
    unsubscribe: jest.fn(),
  } as unknown as TransactionControllerMessenger;
}

describe('IncomingTransactionHelper', () => {
  let subscribeMock: jest.Mock;
  let unsubscribeMock: jest.Mock;
  let transactionUpdatedHandler: (tx: AccountActivityTransaction) => void;
  let connectionStateChangedHandler: (info: WebSocketConnectionInfo) => void;
  let selectedAccountChangedHandler: () => void;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
    jest.setSystemTime(SYSTEM_TIME_MOCK);

    jest
      .mocked(getIncomingTransactionsPollingInterval)
      .mockReturnValue(1000 * 30);

    jest
      .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
      .mockReturnValue(false);

    subscribeMock = jest.fn().mockImplementation((event, handler) => {
      if (event === 'AccountActivityService:transactionUpdated') {
        transactionUpdatedHandler = handler;
      } else if (event === 'BackendWebSocketService:connectionStateChanged') {
        connectionStateChangedHandler = handler;
      } else if (event === 'AccountsController:selectedAccountChange') {
        selectedAccountChangedHandler = handler;
      }
    });
    unsubscribeMock = jest.fn();
  });

  describe('on interval', () => {
    // eslint-disable-next-line jest/expect-expect
    it('handles errors', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([
          TRANSACTION_MOCK_2,
        ]),
      });

      await runInterval(helper, { error: true });
    });

    it('fetches remote transactions using remote transaction source', async () => {
      const remoteTransactionSource = createRemoteTransactionSourceMock([]);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource,
      });

      await runInterval(helper);

      expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
        1,
      );

      expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith({
        address: ADDRESS_MOCK,
        includeTokenTransfers: true,
        tags: ['automatic-polling'],
        updateTransactions: false,
      });
    });

    describe('emits transactions event', () => {
      it('if new transaction fetched', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const { transactions } = await runInterval(helper);

        expect(transactions).toStrictEqual([TRANSACTION_MOCK_2]);
      });

      it('sorted by time in ascending order', async () => {
        const firstTransaction = { ...TRANSACTION_MOCK, time: 5 };
        const secondTransaction = { ...TRANSACTION_MOCK, time: 6 };
        const thirdTransaction = { ...TRANSACTION_MOCK, time: 7 };

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            firstTransaction,
            thirdTransaction,
            secondTransaction,
          ]),
        });

        const { transactions } = await runInterval(helper);

        expect(transactions).toStrictEqual([
          firstTransaction,
          secondTransaction,
          thirdTransaction,
        ]);
      });

      it('excluding duplicates already in local transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getLocalTransactions: (): TransactionMeta[] => [TRANSACTION_MOCK],
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
            TRANSACTION_MOCK_2,
          ]),
        });

        const { transactions } = await runInterval(helper);

        expect(transactions).toStrictEqual([TRANSACTION_MOCK_2]);
      });

      it('including transactions with existing hash but unique from', async () => {
        const localTransaction = {
          ...TRANSACTION_MOCK,
          txParams: { from: '0x4' },
        };

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getLocalTransactions: (): TransactionMeta[] => [localTransaction],
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
            TRANSACTION_MOCK_2,
          ]),
        });

        const { transactions } = await runInterval(helper);

        expect(transactions).toStrictEqual([
          TRANSACTION_MOCK,
          TRANSACTION_MOCK_2,
          localTransaction,
        ]);
      });

      it('does not if disabled', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
          isEnabled: jest
            .fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false),
        });

        const { incomingTransactionsListener } = await runInterval(helper);

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });

      it('does not if no remote transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        const { incomingTransactionsListener } = await runInterval(helper);

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });

      it('does not if error fetching transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock(
            [TRANSACTION_MOCK],
            { error: true },
          ),
        });

        const { incomingTransactionsListener } = await runInterval(helper);

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });

      it('does not if not started', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
        });

        const { incomingTransactionsListener } = await runInterval(helper, {
          start: false,
        });

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });

      it('does not if no unique transactions', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getLocalTransactions: (): TransactionMeta[] => [TRANSACTION_MOCK],
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
        });

        const { incomingTransactionsListener } = await runInterval(helper, {
          start: false,
        });

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });

      it('does not if all unique transactions are truncated', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          trimTransactions: (): TransactionMeta[] => [],
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK,
          ]),
        });

        const { incomingTransactionsListener } = await runInterval(helper, {
          start: false,
        });

        expect(incomingTransactionsListener).not.toHaveBeenCalled();
      });
    });
  });

  describe('start', () => {
    it('adds timeout', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if already started', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      await flushPromises();

      helper.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if disabled', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        isEnabled: (): boolean => false,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not queue additional updates if first is still running', async () => {
      const remoteTransactionSource = createRemoteTransactionSourceMock([]);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource,
      });

      helper.start();
      helper.stop();

      helper.start();
      helper.stop();

      helper.start();

      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);

      expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('stop', () => {
    it('removes timeout', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.stop();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('update', () => {
    it('emits transactions event', async () => {
      const listener = jest.fn();

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([
          TRANSACTION_MOCK_2,
        ]),
      });

      helper.hub.on('transactions', listener);

      await helper.update();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([TRANSACTION_MOCK_2]);
    });

    it('including transactions with same hash but different types', async () => {
      const localTransaction = {
        ...TRANSACTION_MOCK,
        type: TransactionType.simpleSend,
      };

      const remoteTransaction = {
        ...TRANSACTION_MOCK,
        type: TransactionType.incoming,
      };

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        getLocalTransactions: (): TransactionMeta[] => [localTransaction],
        remoteTransactionSource: createRemoteTransactionSourceMock([
          remoteTransaction,
        ]),
      });

      const listener = jest.fn();
      helper.hub.on('transactions', listener);
      await helper.update();

      expect(listener).toHaveBeenCalledWith([
        remoteTransaction,
        localTransaction,
      ]);
    });

    it('excluding transactions with same hash and type', async () => {
      const localTransaction = {
        ...TRANSACTION_MOCK,
        type: TransactionType.simpleSend,
      };

      const remoteTransaction = {
        ...TRANSACTION_MOCK,
        type: TransactionType.simpleSend,
      };
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        getLocalTransactions: (): TransactionMeta[] => [localTransaction],
        remoteTransactionSource: createRemoteTransactionSourceMock([
          remoteTransaction,
        ]),
      });

      const listener = jest.fn();
      helper.hub.on('transactions', listener);
      await helper.update();

      expect(listener).not.toHaveBeenCalled();
    });

    it('includes correct tags in remote transaction source request', async () => {
      const remoteTransactionSource = createRemoteTransactionSourceMock([]);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        client: CLIENT_MOCK,
        remoteTransactionSource,
      });

      await helper.update({ isInterval: false, tags: [TAG_MOCK, TAG_2_MOCK] });

      expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [CLIENT_MOCK, TAG_MOCK, TAG_2_MOCK],
        }),
      );
    });
  });

  describe('transaction history retrieval when useBackendWebSocketService is enabled', () => {
    beforeEach(() => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(true);
    });

    function createMessengerMock(): TransactionControllerMessenger {
      return {
        subscribe: subscribeMock,
        unsubscribe: unsubscribeMock,
      } as unknown as TransactionControllerMessenger;
    }

    function createConnectionInfo(
      state: WebSocketState,
    ): WebSocketConnectionInfo {
      return {
        state,
        url: 'wss://test.com',
        reconnectAttempts: 0,
        timeout: 10000,
        reconnectDelay: 10000,
        maxReconnectDelay: 60000,
        requestTimeout: 30000,
      };
    }

    describe('constructor', () => {
      it('subscribes to connectionStateChanged when useBackendWebSocketService is enabled', async () => {
        const messenger = createMessengerMock();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        expect(subscribeMock).toHaveBeenCalledWith(
          'BackendWebSocketService:connectionStateChanged',
          expect.any(Function),
        );
      });

      it('does not subscribe to connectionStateChanged when useBackendWebSocketService is disabled', async () => {
        jest
          .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
          .mockReturnValue(false);
        const messenger = createMessengerMock();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        expect(subscribeMock).not.toHaveBeenCalledWith(
          'BackendWebSocketService:connectionStateChanged',
          expect.any(Function),
        );
      });
    });

    describe('start', () => {
      it('does not start polling when useBackendWebSocketService is enabled', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        helper.start();
        await flushPromises();

        expect(jest.getTimerCount()).toBe(0);
      });
    });

    describe('on WebSocket connected', () => {
      it('starts transaction history retrieval when WebSocket connects', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource,
        });

        await flushPromises();

        jest.mocked(remoteTransactionSource.fetchTransactions).mockClear();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );
        expect(subscribeMock).toHaveBeenCalledWith(
          'AccountActivityService:transactionUpdated',
          expect.any(Function),
        );
      });

      it('subscribes to selectedAccountChange when WebSocket connects', async () => {
        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        expect(subscribeMock).toHaveBeenCalledWith(
          'AccountsController:selectedAccountChange',
          expect.any(Function),
        );
      });

      it('triggers update on selectedAccountChange event after WebSocket connects', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource,
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        jest.mocked(remoteTransactionSource.fetchTransactions).mockClear();

        selectedAccountChangedHandler();

        await flushPromises();

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );
      });

      it('triggers update on transactionUpdated event after WebSocket connects', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource,
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        jest.mocked(remoteTransactionSource.fetchTransactions).mockClear();

        transactionUpdatedHandler({
          id: 'tx-123',
          chain: 'eip155:1',
          status: 'confirmed',
          timestamp: Date.now(),
          from: '0xother',
          to: ADDRESS_MOCK,
        });

        await flushPromises();

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );
      });

      it('does not start transaction history retrieval if disabled', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          isEnabled: (): boolean => false,
          messenger: createMessengerMock(),
          remoteTransactionSource,
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        expect(
          remoteTransactionSource.fetchTransactions,
        ).not.toHaveBeenCalled();
        expect(subscribeMock).not.toHaveBeenCalledWith(
          'AccountActivityService:transactionUpdated',
          expect.any(Function),
        );
        expect(subscribeMock).not.toHaveBeenCalledWith(
          'AccountsController:selectedAccountChange',
          expect.any(Function),
        );
      });
    });

    describe('on WebSocket disconnected', () => {
      it('unsubscribes from transactionUpdated when WebSocket disconnects', async () => {
        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.DISCONNECTED),
        );

        expect(unsubscribeMock).toHaveBeenCalledWith(
          'AccountActivityService:transactionUpdated',
          expect.any(Function),
        );
      });

      it('unsubscribes from selectedAccountChange when WebSocket disconnects', async () => {
        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.DISCONNECTED),
        );

        expect(unsubscribeMock).toHaveBeenCalledWith(
          'AccountsController:selectedAccountChange',
          expect.any(Function),
        );
      });
    });

    describe('error handling', () => {
      it('handles error in during transaction history retrieval initial update when getCurrentAccount throws', async () => {
        let callCount = 0;
        const getCurrentAccountMock = jest.fn().mockImplementation(() => {
          callCount += 1;
          if (callCount === 1) {
            throw new Error('Account error');
          }
          return CONTROLLER_ARGS_MOCK.getCurrentAccount();
        });

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getCurrentAccount: getCurrentAccountMock,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        expect(subscribeMock).toHaveBeenCalledWith(
          'AccountActivityService:transactionUpdated',
          expect.any(Function),
        );
      });

      it('handles error in update after transaction event when getCurrentAccount throws', async () => {
        let callCount = 0;
        const getCurrentAccountMock = jest.fn().mockImplementation(() => {
          callCount += 1;
          if (callCount === 2) {
            throw new Error('Account error');
          }
          return CONTROLLER_ARGS_MOCK.getCurrentAccount();
        });

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getCurrentAccount: getCurrentAccountMock,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        transactionUpdatedHandler({
          id: 'tx-123',
          chain: 'eip155:1',
          status: 'confirmed',
          timestamp: Date.now(),
          from: '0xother',
          to: ADDRESS_MOCK,
        });

        await flushPromises();

        expect(getCurrentAccountMock).toHaveBeenCalledTimes(2);
      });

      it('handles error in update after account change event when getCurrentAccount throws', async () => {
        let callCount = 0;
        const getCurrentAccountMock = jest.fn().mockImplementation(() => {
          callCount += 1;
          if (callCount === 2) {
            throw new Error('Account error');
          }
          return CONTROLLER_ARGS_MOCK.getCurrentAccount();
        });

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getCurrentAccount: getCurrentAccountMock,
          messenger: createMessengerMock(),
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        connectionStateChangedHandler(
          createConnectionInfo(WebSocketState.CONNECTED),
        );
        await flushPromises();

        selectedAccountChangedHandler();

        await flushPromises();

        expect(getCurrentAccountMock).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('legacy polling mode', () => {
    it('uses polling when useBackendWebSocketService is disabled', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('clears timeout on stop when polling is active', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      await flushPromises();

      jest.advanceTimersByTime(30000);
      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);

      helper.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('handles error in initial polling gracefully', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const remoteTransactionSource = createRemoteTransactionSourceMock([], {
        error: true,
      });

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource,
      });

      helper.start();
      await flushPromises();

      expect(helper).toBeDefined();
    });

    it('handles error in initial polling when getCurrentAccount throws', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const getCurrentAccountMock = jest.fn().mockImplementation(() => {
        throw new Error('Account error');
      });

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        getCurrentAccount: getCurrentAccountMock,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      await flushPromises();

      expect(helper).toBeDefined();
    });

    // eslint-disable-next-line jest/expect-expect
    it('handles error in polling interval gracefully', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const remoteTransactionSource = createRemoteTransactionSourceMock([]);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource,
      });

      helper.start();
      await flushPromises();

      jest
        .mocked(remoteTransactionSource.fetchTransactions)
        .mockRejectedValueOnce(new Error('Test Error'));

      jest.advanceTimersByTime(30000);
      await flushPromises();
    });

    it('reschedules timeout after interval completes', async () => {
      jest
        .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
        .mockReturnValue(false);

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);

      jest.advanceTimersByTime(30000);
      await flushPromises();

      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('trimTransactions', () => {
    it('does not emit when all unique transactions are truncated', async () => {
      const listener = jest.fn();

      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([
          TRANSACTION_MOCK_2,
        ]),
        trimTransactions: (transactions): TransactionMeta[] =>
          transactions.filter((tx) => tx.id !== TRANSACTION_MOCK_2.id),
      });

      helper.hub.on('transactions', listener);

      await helper.update();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('network fallback mechanism', () => {
    describe('when useBackendWebSocketService is true', () => {
      beforeEach(() => {
        jest
          .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
          .mockReturnValue(true);
      });

      it('starts polling when a supported network goes down', async () => {
        const messenger = createMessengerMockWithStatusChanged();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        expect(jest.getTimerCount()).toBe(0);

        // First, bring all supported networks UP
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'up',
        });

        await flushPromises();

        // All networks are up, so polling should not be running
        expect(jest.getTimerCount()).toBe(0);

        // When one supported network goes down, polling should start
        // because not all supported networks are up
        statusChangedHandler({
          chainIds: [MAINNET_CAIP2],
          status: 'down',
        });

        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);
      });

      it('continues polling when one network comes up but others are still down', async () => {
        const messenger = createMessengerMockWithStatusChanged();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        // First, bring all supported networks UP
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'up',
        });

        await flushPromises();

        // Bring down two networks
        statusChangedHandler({
          chainIds: [MAINNET_CAIP2, POLYGON_CAIP2],
          status: 'down',
        });

        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);

        // Bring one network back up, but others are still down
        statusChangedHandler({
          chainIds: [MAINNET_CAIP2],
          status: 'up',
        });

        await flushPromises();

        // Polling should continue because not all networks are up
        expect(jest.getTimerCount()).toBe(1);
      });

      it('stops polling when all supported networks are back up', async () => {
        const messenger = createMessengerMockWithStatusChanged();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        // First, bring all supported networks UP
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'up',
        });

        await flushPromises();

        // Bring down all supported networks
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'down',
        });

        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);

        // Bring all supported networks back up
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'up',
        });

        await flushPromises();

        // Polling should stop because all networks are up
        expect(jest.getTimerCount()).toBe(0);
      });

      it('does not start polling again if already polling', async () => {
        const messenger = createMessengerMockWithStatusChanged();
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource,
        });

        await flushPromises();

        // First, bring all supported networks UP
        statusChangedHandler({
          chainIds: SUPPORTED_CAIP2_CHAINS,
          status: 'up',
        });

        await flushPromises();

        // First network goes down, polling starts
        statusChangedHandler({
          chainIds: [MAINNET_CAIP2],
          status: 'down',
        });

        await flushPromises();

        expect(jest.getTimerCount()).toBe(1);

        // Another network goes down, but polling is already running
        statusChangedHandler({
          chainIds: [POLYGON_CAIP2],
          status: 'down',
        });

        await flushPromises();

        // Should still have only 1 timer (no duplicate polling)
        expect(jest.getTimerCount()).toBe(1);
      });

      it('does not start polling before first statusChanged event', async () => {
        const messenger = createMessengerMockWithStatusChanged();

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        // Polling should not start automatically on initialization
        expect(jest.getTimerCount()).toBe(0);
      });
    });

    describe('when useBackendWebSocketService is false', () => {
      it('does not subscribe to statusChanged events', async () => {
        jest
          .mocked(isIncomingTransactionsUseBackendWebSocketServiceEnabled)
          .mockReturnValue(false);
        const localSubscribeMock = jest.fn();
        const messenger = {
          subscribe: localSubscribeMock,
          unsubscribe: jest.fn(),
        } as unknown as TransactionControllerMessenger;

        // eslint-disable-next-line no-new
        new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          messenger,
          remoteTransactionSource: createRemoteTransactionSourceMock([]),
        });

        await flushPromises();

        expect(localSubscribeMock).not.toHaveBeenCalledWith(
          'AccountActivityService:statusChanged',
          expect.any(Function),
        );
      });
    });
  });
});
