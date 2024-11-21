import type { Hex } from '@metamask/utils';

import { flushPromises } from '../../../../tests/helpers';
import {
  TransactionStatus,
  type RemoteTransactionSource,
  type TransactionMeta,
} from '../types';
import { IncomingTransactionHelper } from './IncomingTransactionHelper';

jest.useFakeTimers();

// eslint-disable-next-line jest/prefer-spy-on
console.error = jest.fn();

const CHAIN_ID_MOCK = '0x1' as const;
const ADDRESS_MOCK = '0x1';
const SYSTEM_TIME_MOCK = 1000 * 60 * 60 * 24 * 2;
const CACHE_MOCK = {};

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
      metadata: {
        name: 'Account 1',
        keyring: { type: 'HD Key Tree' },
        importTime: 1631619180000,
        lastSelected: 1631619180000,
      },
    };
  },
  getCache: () => CACHE_MOCK,
  getChainIds: () => [CHAIN_ID_MOCK],
  remoteTransactionSource: {} as RemoteTransactionSource,
  updateCache: jest.fn(),
};

const TRANSACTION_MOCK: TransactionMeta = {
  chainId: '0x1',
  hash: '0x1',
  status: TransactionStatus.submitted,
  time: 0,
  txParams: { to: '0x1', gasUsed: '0x1' },
} as unknown as TransactionMeta;

const TRANSACTION_MOCK_2: TransactionMeta = {
  hash: '0x2',
  chainId: '0x1',
  time: 1,
  txParams: { to: '0x1' },
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
  getSupportedChains: jest.fn(() => chainIds ?? [CHAIN_ID_MOCK]),
  fetchTransactions: jest.fn(() =>
    error
      ? Promise.reject(new Error('Test Error'))
      : Promise.resolve(remoteTransactions),
  ),
});

/**
 * Emulate running the interval.
 * @param helper - The instance of IncomingTransactionHelper to use.
 * @param options - The options.
 * @param options.start - Whether to start the helper.
 * @param options.error - Whether to simulate an error in the incoming-transactions listener.
 * @returns The event data and listeners.
 */
async function runInterval(
  helper: IncomingTransactionHelper,
  { start, error }: { start?: boolean; error?: boolean } = {},
) {
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

describe('IncomingTransactionHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
    jest.setSystemTime(SYSTEM_TIME_MOCK);
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
        cache: CACHE_MOCK,
        chainIds: [CHAIN_ID_MOCK],
        includeTokenTransfers: true,
        queryEntireHistory: true,
        updateCache: expect.any(Function),
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

      it('does not if current network is not supported by remote transaction source', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock(
            [TRANSACTION_MOCK],
            { chainIds: ['0x123'] },
          ),
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
    });
  });

  describe('start', () => {
    it('adds timeout', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if already started', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();
      helper.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('does nothing if disabled', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        isEnabled: () => false,
        remoteTransactionSource: createRemoteTransactionSourceMock([]),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('does nothing if network not supported by remote transaction source', async () => {
      const helper = new IncomingTransactionHelper({
        ...CONTROLLER_ARGS_MOCK,
        remoteTransactionSource: createRemoteTransactionSourceMock([], {
          chainIds: ['0x123'],
        }),
      });

      helper.start();

      expect(jest.getTimerCount()).toBe(0);
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
  });
});
