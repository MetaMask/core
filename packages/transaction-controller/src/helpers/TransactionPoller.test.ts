import type { Transaction } from '@metamask/core-backend';
import type { BlockTracker } from '@metamask/network-controller';

import { TransactionPoller } from './TransactionPoller';
import { flushPromises } from '../../../../tests/helpers';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';

jest.useFakeTimers();

const BLOCK_NUMBER_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const DEFAULT_ACCELERATED_COUNT_MAX = 10;
const DEFAULT_ACCELERATED_POLLING_INTERVAL_MS = 3000;

const BLOCK_TRACKER_MOCK = {
  getLatestBlock: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
} as unknown as jest.Mocked<BlockTracker>;

const SELECTED_ACCOUNT_MOCK = {
  address: '0x123',
};

const createMessengerMock = (): jest.Mocked<TransactionControllerMessenger> =>
  ({
    call: jest.fn().mockImplementation((action: string) => {
      if (action === 'AccountsController:getSelectedAccount') {
        return SELECTED_ACCOUNT_MOCK;
      }
      return {};
    }),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  }) as unknown as jest.Mocked<TransactionControllerMessenger>;

let MESSENGER_MOCK: jest.Mocked<TransactionControllerMessenger>;

jest.mock('../utils/feature-flags', () => ({
  getAcceleratedPollingParams: (): {
    countMax: number;
    intervalMs: number;
  } => ({
    countMax: DEFAULT_ACCELERATED_COUNT_MAX,
    intervalMs: DEFAULT_ACCELERATED_POLLING_INTERVAL_MS,
  }),
}));

/**
 * Creates a mock transaction metadata object.
 *
 * @param id - The transaction ID.
 * @returns The mock transaction metadata object.
 */
function createTransactionMetaMock(id: string): TransactionMeta {
  return { id } as TransactionMeta;
}

describe('TransactionPoller', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
    MESSENGER_MOCK = createMessengerMock();
  });

  describe('Accelerated Polling', () => {
    it('invokes listener after timeout', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      expect(jest.getTimerCount()).toBe(1);

      jest.runOnlyPendingTimers();
      await flushPromises();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops creating timeouts after max reached', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX * 3; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      expect(listener).toHaveBeenCalledTimes(DEFAULT_ACCELERATED_COUNT_MAX);
    });

    it('invokes listener with latest block number from block tracker', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      BLOCK_TRACKER_MOCK.getLatestBlock.mockResolvedValue(BLOCK_NUMBER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      jest.runOnlyPendingTimers();
      await flushPromises();

      expect(listener).toHaveBeenCalledWith(BLOCK_NUMBER_MOCK);
    });

    it('does not create timeout if stopped while listener being invoked', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

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
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      BLOCK_TRACKER_MOCK.on.mock.calls[0][1]();
      await flushPromises();

      BLOCK_TRACKER_MOCK.on.mock.calls[0][1]();
      await flushPromises();

      expect(listener).toHaveBeenCalledTimes(DEFAULT_ACCELERATED_COUNT_MAX + 2);
    });

    it('invokes listener with latest block number from event', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
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
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      poller.start(jest.fn());
      poller.start(jest.fn());

      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('stop', () => {
    it('removes timeout', () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);
      poller.stop();

      expect(jest.getTimerCount()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it('removes block tracker listener', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
        jest.runOnlyPendingTimers();
        await flushPromises();
      }

      poller.stop();

      expect(BLOCK_TRACKER_MOCK.removeListener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(DEFAULT_ACCELERATED_COUNT_MAX);
    });

    it('does nothing if not started', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

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
        const poller = new TransactionPoller({
          blockTracker: BLOCK_TRACKER_MOCK,
          messenger: MESSENGER_MOCK,
          chainId: CHAIN_ID_MOCK,
        });

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

        for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        expect(listener).toHaveBeenCalledTimes(
          DEFAULT_ACCELERATED_COUNT_MAX + 3,
        );
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
        const poller = new TransactionPoller({
          blockTracker: BLOCK_TRACKER_MOCK,
          messenger: MESSENGER_MOCK,
          chainId: CHAIN_ID_MOCK,
        });

        poller.setPendingTransactions([
          createTransactionMetaMock('1'),
          createTransactionMetaMock('2'),
        ]);

        const listener = jest.fn();
        poller.start(listener);

        for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        BLOCK_TRACKER_MOCK.on.mock.calls[0][1](BLOCK_NUMBER_MOCK);
        await flushPromises();

        BLOCK_TRACKER_MOCK.on.mock.calls[0][1](BLOCK_NUMBER_MOCK);
        await flushPromises();

        poller.setPendingTransactions(newPendingTransactions);

        for (let i = 0; i < DEFAULT_ACCELERATED_COUNT_MAX; i++) {
          jest.runOnlyPendingTimers();
          await flushPromises();
        }

        expect(listener).toHaveBeenCalledTimes(
          DEFAULT_ACCELERATED_COUNT_MAX * 2 + 2,
        );
      },
    );
  });

  describe('AccountActivityService:transactionUpdated event', () => {
    it('subscribes to event when started', () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      expect(MESSENGER_MOCK.subscribe).toHaveBeenCalledWith(
        'AccountActivityService:transactionUpdated',
        expect.any(Function),
      );
    });

    it('unsubscribes from event when stopped', () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);
      poller.stop();

      expect(MESSENGER_MOCK.unsubscribe).toHaveBeenCalledWith(
        'AccountActivityService:transactionUpdated',
        expect.any(Function),
      );
    });

    it.each(['confirmed', 'dropped', 'failed'])(
      'triggers interval when transaction with %s status is received',
      async (status) => {
        const poller = new TransactionPoller({
          blockTracker: BLOCK_TRACKER_MOCK,
          messenger: MESSENGER_MOCK,
          chainId: CHAIN_ID_MOCK,
        });

        BLOCK_TRACKER_MOCK.getLatestBlock.mockResolvedValue(BLOCK_NUMBER_MOCK);

        const listener = jest.fn();
        poller.start(listener);

        const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
          (call) => call[0] === 'AccountActivityService:transactionUpdated',
        );
        const eventHandler = subscribeCall?.[1] as (
          transaction: Transaction,
        ) => void;

        const transaction: Transaction = {
          id: '0xabc',
          chain: 'eip155:1',
          status,
          timestamp: Date.now(),
          from: '0x123',
          to: '0x456',
        };

        eventHandler(transaction);
        await flushPromises();

        expect(listener).toHaveBeenCalledTimes(1);
      },
    );

    it('does not trigger interval when transaction with non-matching chainId is received', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
        (call) => call[0] === 'AccountActivityService:transactionUpdated',
      );
      const eventHandler = subscribeCall?.[1] as (
        transaction: Transaction,
      ) => void;

      const transaction: Transaction = {
        id: '0xabc',
        chain: 'eip155:137', // Different chain
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0x123',
        to: '0x456',
      };

      eventHandler(transaction);
      await flushPromises();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not trigger interval when transaction with pending status is received', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
        (call) => call[0] === 'AccountActivityService:transactionUpdated',
      );
      const eventHandler = subscribeCall?.[1] as (
        transaction: Transaction,
      ) => void;

      const transaction: Transaction = {
        id: '0xabc',
        chain: 'eip155:1',
        status: 'pending',
        timestamp: Date.now(),
        from: '0x123',
        to: '0x456',
      };

      eventHandler(transaction);
      await flushPromises();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not trigger interval when transaction is from a different address than the selected account', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
        (call) => call[0] === 'AccountActivityService:transactionUpdated',
      );
      const eventHandler = subscribeCall?.[1] as (
        transaction: Transaction,
      ) => void;

      const transaction: Transaction = {
        id: '0xabc',
        chain: 'eip155:1',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0x999',
        to: '0x456',
      };

      eventHandler(transaction);
      await flushPromises();

      expect(listener).not.toHaveBeenCalled();
    });

    it('triggers interval when transaction from address matches selected account (case-insensitive)', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      BLOCK_TRACKER_MOCK.getLatestBlock.mockResolvedValue(BLOCK_NUMBER_MOCK);

      const listener = jest.fn();
      poller.start(listener);

      const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
        (call) => call[0] === 'AccountActivityService:transactionUpdated',
      );
      const eventHandler = subscribeCall?.[1] as (
        transaction: Transaction,
      ) => void;

      const transaction: Transaction = {
        id: '0xabc',
        chain: 'eip155:1',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0X123',
        to: '0x456',
      };

      eventHandler(transaction);
      await flushPromises();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not trigger interval when poller is stopped', async () => {
      const poller = new TransactionPoller({
        blockTracker: BLOCK_TRACKER_MOCK,
        messenger: MESSENGER_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const listener = jest.fn();
      poller.start(listener);

      const subscribeCall = MESSENGER_MOCK.subscribe.mock.calls.find(
        (call) => call[0] === 'AccountActivityService:transactionUpdated',
      );
      const eventHandler = subscribeCall?.[1] as (
        transaction: Transaction,
      ) => void;

      poller.stop();

      const transaction: Transaction = {
        id: '0xabc',
        chain: 'eip155:1',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0x123',
        to: '0x456',
      };

      eventHandler(transaction);
      await flushPromises();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
