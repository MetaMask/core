import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getMaxAmountRefreshInterval } from '../../utils/max-quote.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote } from './types.js';

vi.mock(import('./relay-quotes.js'));
vi.mock(import('./relay-submit.js'));
vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../../utils/max-quote.js'));

describe('RelayStrategy', () => {
  const getRelayQuotesMock = vi.mocked(getRelayQuotes);
  const submitRelayQuotesMock = vi.mocked(submitRelayQuotes);
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

  it('returns false when a request has a non-EVM source asset', () => {
    const strategy = new RelayStrategy();

    expect(
      strategy.supports({ ...request, requests: [nonEvmQuoteRequest] }),
    ).toBe(false);
  });

  it('delegates getRefreshInterval', async () => {
    const getMaxAmountRefreshIntervalMock = vi.mocked(
      getMaxAmountRefreshInterval,
    );
    getMaxAmountRefreshIntervalMock.mockReturnValue(5000);

    const refreshRequest = {
      chainId: 'eip155:1' as const,
      messenger,
      transactionId: 'tx-1',
    };

    const strategy = new RelayStrategy();

    expect(await strategy.getRefreshInterval(refreshRequest)).toBe(5000);
    expect(getMaxAmountRefreshIntervalMock).toHaveBeenCalledWith(
      refreshRequest,
    );
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
