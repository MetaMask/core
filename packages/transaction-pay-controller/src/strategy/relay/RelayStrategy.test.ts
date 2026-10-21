import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getRelayQuotes } from './relay-quotes.js';
import { getRelaySolanaQuotes } from './relay-solana-quotes.js';
import { submitRelayNonEvmQuote } from './relay-submit-non-evm.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote, RelaySolanaPayQuote } from './types.js';

jest.mock('./relay-quotes');
jest.mock('./relay-solana-quotes');
jest.mock('./relay-submit-non-evm');
jest.mock('./relay-submit');
jest.mock('../../utils/feature-flags');

describe('RelayStrategy', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
  const getRelaySolanaQuotesMock = jest.mocked(getRelaySolanaQuotes);
  const submitRelayNonEvmQuoteMock = jest.mocked(submitRelayNonEvmQuote);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);

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
    jest.resetAllMocks();

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

  it('routes non-EVM requests to the Solana /quote/v2 path only', async () => {
    const nonEvmRequest = {
      ...request,
      nonEvmRequests: [{ sourceChainId: 'solana:mainnet' }],
      requests: [],
    } as unknown as PayStrategyGetQuotesRequest;
    getRelaySolanaQuotesMock.mockResolvedValue([]);

    const strategy = new RelayStrategy();
    await strategy.getQuotes(nonEvmRequest);

    expect(getRelaySolanaQuotesMock).toHaveBeenCalledWith(nonEvmRequest);
    expect(getRelayQuotesMock).not.toHaveBeenCalled();
  });

  it('keeps EVM requests on the existing /quote path', async () => {
    getRelayQuotesMock.mockResolvedValue([]);

    const strategy = new RelayStrategy();
    await strategy.getQuotes({ ...request, nonEvmRequests: [] });

    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelaySolanaQuotesMock).not.toHaveBeenCalled();
  });

  it('executes a non-EVM quote through the non-EVM submit branch only', async () => {
    const nonEvmQuote = { strategy: TransactionPayStrategy.Relay };
    const executeRequest = {
      messenger,
      nonEvmQuotes: [nonEvmQuote],
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: jest.fn(),
    } as unknown as PayStrategyExecuteRequest<RelayQuote, RelaySolanaPayQuote>;

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

  it('rejects multiple non-EVM quotes', async () => {
    const executeRequest = {
      messenger,
      nonEvmQuotes: [{}, {}],
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: jest.fn(),
    } as unknown as PayStrategyExecuteRequest<RelayQuote, RelaySolanaPayQuote>;

    const strategy = new RelayStrategy();

    await expect(strategy.execute(executeRequest)).rejects.toThrow(
      'Relay: Multiple non-EVM quotes are not supported',
    );
    expect(submitRelayNonEvmQuoteMock).not.toHaveBeenCalled();
  });

  it('delegates execute', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: jest.fn(),
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
      isSmartTransaction: jest.fn(),
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
      isSmartTransaction: jest.fn(),
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
