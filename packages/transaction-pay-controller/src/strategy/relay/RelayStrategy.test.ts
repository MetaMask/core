import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import {
  getMaxBalanceRefreshInterval,
  getPayStrategiesConfig,
} from '../../utils/feature-flags.js';
import { getTransaction } from '../../utils/transaction.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote } from './types.js';

vi.mock(import('./relay-quotes.js'));
vi.mock(import('./relay-submit.js'));
vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../../utils/transaction.js'));

describe('RelayStrategy', () => {
  const getRelayQuotesMock = vi.mocked(getRelayQuotes);
  const submitRelayQuotesMock = vi.mocked(submitRelayQuotes);
  const getPayStrategiesConfigMock = vi.mocked(getPayStrategiesConfig);

  const messenger = {} as never;

  const request = {
    messenger,
    requests: [
      {
        from: '0xabc' as Hex,
        sourceBalanceRaw: '100',
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
        sourceTokenAmount: '100',
        targetAmountMinimum: '100',
        targetChainId: '0x2' as Hex,
        targetTokenAddress: '0xdef' as Hex,
      },
    ],
    transaction: {
      txParams: { from: '0xabc' as Hex },
    },
  } as unknown as PayStrategyGetQuotesRequest;

  beforeEach(() => {
    vi.resetAllMocks();

    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        apiBase: 'https://across.test',
        enabled: true,
        fallbackGas: {
          estimate: 900000,
          max: 1500000,
        },
      },
      relay: {
        enabled: true,
      },
    });
  });

  it('returns true from supports when relay is enabled', () => {
    const strategy = new RelayStrategy();
    expect(strategy.supports(request)).toBe(true);
  });

  it('returns false from supports when relay is disabled', () => {
    getPayStrategiesConfigMock.mockReturnValue({
      across: {
        apiBase: 'https://across.test',
        enabled: true,
        fallbackGas: {
          estimate: 900000,
          max: 1500000,
        },
      },
      relay: {
        enabled: false,
      },
    });

    const strategy = new RelayStrategy();
    expect(strategy.supports(request)).toBe(false);
  });

  it('delegates getQuotes', async () => {
    const quote = {
      request: {
        sourceChainId: '0x1',
        sourceTokenAddress: '0xabc',
      },
      strategy: TransactionPayStrategy.Relay,
    } as TransactionPayQuote<RelayQuote>;
    getRelayQuotesMock.mockResolvedValue([quote]);

    const strategy = new RelayStrategy();
    expect(await strategy.getQuotes(request)).toStrictEqual([quote]);
    expect(getRelayQuotesMock).toHaveBeenCalledWith(request);
  });

  describe('getRefreshInterval', () => {
    const getMaxBalanceRefreshIntervalMock = vi.mocked(
      getMaxBalanceRefreshInterval,
    );
    const getTransactionMock = vi.mocked(getTransaction);
    const transactionMock = { id: 'tx-1' } as TransactionMeta;
    const getStateMock = vi.fn();
    const refreshMessenger = {
      call: getStateMock,
    } as unknown as TransactionPayControllerMessenger;
    const refreshRequest = {
      chainId: '0x1' as Hex,
      messenger: refreshMessenger,
      transactionId: 'tx-1',
    };

    beforeEach(() => {
      getTransactionMock.mockReturnValue(transactionMock);
      getStateMock.mockReturnValue({
        transactionData: { 'tx-1': { isMaxAmount: true } },
      });
    });

    it('returns undefined when not max amount', async () => {
      getStateMock.mockReturnValue({ transactionData: {} });

      const strategy = new RelayStrategy();

      expect(await strategy.getRefreshInterval(refreshRequest)).toBeUndefined();
      expect(getTransactionMock).not.toHaveBeenCalled();
    });

    it('returns max balance refresh interval for max amount', async () => {
      getMaxBalanceRefreshIntervalMock.mockReturnValue(5000);

      const strategy = new RelayStrategy();

      expect(await strategy.getRefreshInterval(refreshRequest)).toBe(5000);
      expect(getTransactionMock).toHaveBeenCalledWith('tx-1', refreshMessenger);
      expect(getMaxBalanceRefreshIntervalMock).toHaveBeenCalledWith(
        refreshMessenger,
        transactionMock,
      );
    });

    it('returns undefined when no interval is configured', async () => {
      getMaxBalanceRefreshIntervalMock.mockReturnValue(undefined);

      const strategy = new RelayStrategy();

      expect(await strategy.getRefreshInterval(refreshRequest)).toBeUndefined();
    });
  });

  it('delegates execute', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: vi.fn(),
    } as PayStrategyExecuteRequest<RelayQuote>;

    submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0xhash' });

    const strategy = new RelayStrategy();
    expect(await strategy.execute(executeRequest)).toStrictEqual({
      transactionHash: '0xhash',
    });
    expect(submitRelayQuotesMock).toHaveBeenCalledWith(executeRequest);
  });

  it('propagates execute errors without replacing the Error object', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: vi.fn(),
    } as PayStrategyExecuteRequest<RelayQuote>;
    const error = new Error('Insufficient liquidity');

    submitRelayQuotesMock.mockRejectedValue(error);

    const strategy = new RelayStrategy();
    const thrown = await strategy
      .execute(executeRequest)
      .catch((caught) => caught);

    expect(thrown).toBe(error);
    expect(thrown.message).toBe('Insufficient liquidity');
  });

  it('propagates Relay-prefixed execute errors from submitRelayQuotes', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: vi.fn(),
    } as PayStrategyExecuteRequest<RelayQuote>;

    submitRelayQuotesMock.mockRejectedValue(
      new Error('Relay: Execute: 422 - Insufficient liquidity'),
    );

    const strategy = new RelayStrategy();

    await expect(strategy.execute(executeRequest)).rejects.toThrow(
      'Relay: Execute: 422 - Insufficient liquidity',
    );
  });
});
