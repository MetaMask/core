import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import {
  getMaxBalanceRefreshInterval,
  getPayStrategiesConfig,
} from '../../utils/feature-flags.js';
import { getTransaction } from '../../utils/transaction.js';
import { getRelayQuotes } from './relay-quotes.js';
import { getRelaySolanaQuotes } from './relay-solana-quotes.js';
import { submitRelayNonEvmQuote } from './relay-submit-non-evm.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote, RelaySolanaPayQuote } from './types.js';

vi.mock(import('./relay-quotes.js'));
vi.mock(import('./relay-solana-quotes.js'));
vi.mock(import('./relay-submit-non-evm.js'));
vi.mock(import('./relay-submit.js'));
vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../../utils/transaction.js'));

describe('RelayStrategy', () => {
  const getRelayQuotesMock = vi.mocked(getRelayQuotes);
  const submitRelayQuotesMock = vi.mocked(submitRelayQuotes);
  const getRelaySolanaQuotesMock = vi.mocked(getRelaySolanaQuotes);
  const submitRelayNonEvmQuoteMock = vi.mocked(submitRelayNonEvmQuote);
  const getPayStrategiesConfigMock = vi.mocked(getPayStrategiesConfig);

  const messenger = {} as never;

  const nonEvmQuoteRequest = {
    from: '0xabc' as Hex,
    sourceAccountId:
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
    sourceAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    sourceBalanceRaw: '100',
    sourceTokenAmount: '100',
    targetAmountMinimum: '100',
    targetChainId: '0x2' as Hex,
    targetTokenAddress: '0xdef' as Hex,
  } satisfies QuoteRequest;

  const request = {
    messenger,
    requests: [
      {
        from: '0xabc' as Hex,
        sourceAccountId: 'eip155:1:0xabc',
        sourceAssetId: 'eip155:1/erc20:0xabc',
        sourceBalanceRaw: '100',
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
        sourceAssetId: 'eip155:1/erc20:0xabc',
      },
      strategy: TransactionPayStrategy.Relay,
    } as TransactionPayQuote<RelayQuote>;
    getRelayQuotesMock.mockResolvedValue([quote]);

    const strategy = new RelayStrategy();
    expect(await strategy.getQuotes(request)).toStrictEqual([quote]);
    expect(getRelayQuotesMock).toHaveBeenCalledWith(request);
  });

  it('supports requests with a non-EVM source asset', () => {
    const strategy = new RelayStrategy();

    expect(
      strategy.supports({ ...request, requests: [nonEvmQuoteRequest] }),
    ).toBe(true);
  });

  it('routes requests with a non-EVM source asset to the Solana quote path only', async () => {
    const nonEvmRequest = {
      ...request,
      requests: [nonEvmQuoteRequest],
    } as PayStrategyGetQuotesRequest;
    getRelaySolanaQuotesMock.mockResolvedValue([]);

    const strategy = new RelayStrategy();
    await strategy.getQuotes(nonEvmRequest);

    expect(getRelaySolanaQuotesMock).toHaveBeenCalledWith(nonEvmRequest);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('keeps requests with an EVM source asset on the existing /quote path', async () => {
    getRelayQuotesMock.mockResolvedValue([]);

    const strategy = new RelayStrategy();
    await strategy.getQuotes(request);

    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelaySolanaQuotesMock).not.toHaveBeenCalled();
  });

  it('executes a quote with a non-EVM source asset through the non-EVM submit branch only', async () => {
    const nonEvmQuote = {
      request: nonEvmQuoteRequest,
      strategy: TransactionPayStrategy.Relay,
    };
    const executeRequest = {
      messenger,
      quotes: [nonEvmQuote],
      transaction: request.transaction,
      isSmartTransaction: vi.fn(),
    } as unknown as PayStrategyExecuteRequest<RelayQuote | RelaySolanaPayQuote>;

    submitRelayNonEvmQuoteMock.mockResolvedValue({
      externallyHandled: true,
      outcome: 'submitted',
    });

    const strategy = new RelayStrategy();

    expect(await strategy.execute(executeRequest)).toStrictEqual({
      externallyHandled: true,
      outcome: 'submitted',
    });
    expect(submitRelayNonEvmQuoteMock).toHaveBeenCalledWith({
      messenger,
      quote: nonEvmQuote,
      transaction: request.transaction,
    });
    expect(submitRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('rejects multiple quotes with a non-EVM source asset', async () => {
    const nonEvmQuote = { request: nonEvmQuoteRequest };
    const executeRequest = {
      messenger,
      quotes: [nonEvmQuote, nonEvmQuote],
      transaction: request.transaction,
      isSmartTransaction: vi.fn(),
    } as unknown as PayStrategyExecuteRequest<RelayQuote | RelaySolanaPayQuote>;

    const strategy = new RelayStrategy();

    await expect(strategy.execute(executeRequest)).rejects.toThrow(
      'Relay: Multiple non-EVM quotes are not supported',
    );
    expect(submitRelayNonEvmQuoteMock).not.toHaveBeenCalled();
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
      chainId: 'eip155:1' as const,
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
