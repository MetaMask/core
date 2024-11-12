import type { BlockTracker } from '@metamask/network-controller';

import { flushPromises } from '../../../../tests/helpers';
import type { TransactionMeta } from '../types';
import { ACCELERATED_COUNT_MAX, TransactionPoller } from './TransactionPoller';

jest.useFakeTimers();

const BLOCK_NUMBER_MOCK = '0x123';

const BLOCK_TRACKER_MOCK = {
  getLatestBlock: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
} as unknown as jest.Mocked<BlockTracker>;

/**
 * Creates a mock transaction metadata object.
 * @param id - The transaction ID.
 * @returns The mock transaction metadata object.
 */
function createTransactionMetaMock(id: string) {
  return { id } as TransactionMeta;
}

describe('TransactionPoller', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
  });

  describe('Accelerated Polling', () => {
    it('invokes listener after timeout', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      expect(jest.getTimerCount()).toBe(1);

      jest.runOnlyPendingTimers();
      await flushPromises();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops creating timeouts after max reached', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < ACCELERATED_COUNT_MAX * 3; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      expect(listener).toHaveBeenCalledTimes(ACCELERATED_COUNT_MAX);
    });

    it('invokes listener with latest block number from block tracker', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      BLOCK_TRACKER_MOCK.getLatestBlock.mockResolvedValue(BLOCK_NUMBER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      jest.runOnlyPendingTimers();
      await flushPromises();

      expect(listener).toHaveBeenCalledWith(BLOCK_NUMBER_MOCK);
    });

    it('does not create timeout if stopped while listener being invoked', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      listener.mockImplementation(() => poller.stop());

      poller.start(listener);

      jest.runOnlyPendingTimers();
      await flushPromises();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Block Tracker Polling', () => {
    it('invokes listener on block tracker update after accelerated limit reached', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      BLOCK_TRACKER_MOCK.on.mock.calls[0][1]();
      await flushPromises();

      BLOCK_TRACKER_MOCK.on.mock.calls[0][1]();
      await flushPromises();

      expect(listener).toHaveBeenCalledTimes(ACCELERATED_COUNT_MAX + 2);
    });

    it('invokes listener with latest block number from event', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      BLOCK_TRACKER_MOCK.on.mock.calls[0][1](BLOCK_NUMBER_MOCK);
      await flushPromises();

      expect(listener).toHaveBeenCalledWith(BLOCK_NUMBER_MOCK);
    });
  });

  describe('start', () => {
    it('does nothing if already started', () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      poller.start(jest.fn());
      poller.start(jest.fn());

      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('stop', () => {
    it('removes timeout', () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);
      poller.stop();

      expect(jest.getTimerCount()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it('removes block tracker listener', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      poller.stop();

      expect(BLOCK_TRACKER_MOCK.removeListener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(ACCELERATED_COUNT_MAX);
    });

    it('does nothing if not started', async () => {
      const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

      poller.stop();

      expect(jest.getTimerCount()).toBe(0);
      expect(BLOCK_TRACKER_MOCK.removeListener).not.toHaveBeenCalled();
    });
  });

  describe('setPendingTransactions', () => {
    it.each([
      [
        'added',
        [
          createTransactionMetaMock('1'),
          createTransactionMetaMock('2'),
          createTransactionMetaMock('3'),
        ],
      ],
      ['removed', [createTransactionMetaMock('1')]],
    ])(
      'resets accelerated count if transaction IDs %s',
      async (_title, newPendingTransactions) => {
        const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

        poller.setPendingTransactions([
          createTransactionMetaMock('1'),
          createTransactionMetaMock('2'),
        ]);

        const listener = jest.fn();
        poller.start(listener);

        for (let i = 0; i < 3; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        poller.setPendingTransactions(newPendingTransactions);

        for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        expect(listener).toHaveBeenCalledTimes(ACCELERATED_COUNT_MAX + 3);
      },
    );

    it.each([
      [
        'added',
        [
          createTransactionMetaMock('1'),
          createTransactionMetaMock('2'),
          createTransactionMetaMock('3'),
        ],
      ],
      ['removed', [createTransactionMetaMock('1')]],
    ])(
      'resets to accelerated polling if transaction IDs added',
      async (_title, newPendingTransactions) => {
        const poller = new TransactionPoller(BLOCK_TRACKER_MOCK);

        poller.setPendingTransactions([
          createTransactionMetaMock('1'),
          createTransactionMetaMock('2'),
        ]);

        const listener = jest.fn();
        poller.start(listener);

        for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        BLOCK_TRACKER_MOCK.on.mock.calls[0][1](BLOCK_NUMBER_MOCK);
        await flushPromises();

        BLOCK_TRACKER_MOCK.on.mock.calls[0][1](BLOCK_NUMBER_MOCK);
        await flushPromises();

        for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        poller.setPendingTransactions(newPendingTransactions);

        for (let i = 0; i < ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        expect(listener).toHaveBeenCalledTimes(ACCELERATED_COUNT_MAX * 2 + 2);
      },
    );
  });
});
