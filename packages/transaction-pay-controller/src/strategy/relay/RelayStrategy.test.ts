import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote } from './types.js';

jest.mock('./relay-quotes');
jest.mock('./relay-submit');
jest.mock('../../utils/feature-flags');

describe('RelayStrategy', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
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
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
      },
      strategy: TransactionPayStrategy.Relay,
    } as TransactionPayQuote<RelayQuote>;
    getRelayQuotesMock.mockResolvedValue([quote]);

    const strategy = new RelayStrategy();
    expect(await strategy.getQuotes(request)).toStrictEqual([quote]);
    expect(getRelayQuotesMock).toHaveBeenCalledWith(request);
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
