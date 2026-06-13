import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import {
  isQuoteValidationError,
  validateQuoteExecution,
} from '../../utils/validation';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import { RelayStrategy } from './RelayStrategy';
import { buildRelaySimulation } from './simulation';
import type { RelayQuote } from './types';

jest.mock('./relay-quotes');
jest.mock('./simulation');
jest.mock('./relay-submit');
jest.mock('../../utils/feature-flags');
jest.mock('../../utils/validation');

describe('RelayStrategy', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const buildRelaySimulationMock = jest.mocked(buildRelaySimulation);
  const isQuoteValidationErrorMock = jest.mocked(isQuoteValidationError);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);
  const validateQuoteExecutionMock = jest.mocked(validateQuoteExecution);

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
    buildRelaySimulationMock.mockResolvedValue({ transactions: [] });
    isQuoteValidationErrorMock.mockReturnValue(false);
    validateQuoteExecutionMock.mockResolvedValue(undefined);
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
    const quote = { strategy: 'relay' } as TransactionPayQuote<RelayQuote>;
    getRelayQuotesMock.mockResolvedValue([quote]);

    const strategy = new RelayStrategy();
    expect(await strategy.getQuotes(request)).toStrictEqual([quote]);
    expect(getRelayQuotesMock).toHaveBeenCalledWith(request);
  });

  it('validates quotes in checkQuoteSupport', async () => {
    const quote = buildQuote();

    const strategy = new RelayStrategy();
    const result = await strategy.checkQuoteSupport({
      messenger,
      quotes: [quote],
      transaction: request.transaction,
    });

    expect(result).toStrictEqual({ isSupported: true });
    expect(buildRelaySimulationMock).toHaveBeenCalledWith({
      messenger,
      quote,
      transaction: request.transaction,
    });
    expect(validateQuoteExecutionMock).toHaveBeenCalledWith({
      messenger,
      quote,
      signal: undefined,
      simulation: { transactions: [] },
    });
  });

  it('returns quote validation errors from checkQuoteSupport', async () => {
    const validationError = {
      code: 'insufficient_source_balance',
      message: 'Insufficient source token balance for quote',
      strategy: TransactionPayStrategy.Relay,
    } as const;
    const quote = buildQuote();
    const error = { validationError } as unknown as Error;

    isQuoteValidationErrorMock.mockReturnValue(true);
    validateQuoteExecutionMock.mockRejectedValue(error);

    const strategy = new RelayStrategy();
    const result = await strategy.checkQuoteSupport({
      messenger,
      quotes: [quote],
      transaction: request.transaction,
    });

    expect(result).toStrictEqual({
      isSupported: false,
      validationError,
    });
  });

  it('wraps unknown quote validation errors', async () => {
    const quote = {
      request: {
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
      },
      strategy: TransactionPayStrategy.Relay,
    } as TransactionPayQuote<RelayQuote>;

    buildRelaySimulationMock.mockResolvedValue({ transactions: [] });
    validateQuoteExecutionMock.mockRejectedValue(new Error('RPC down'));

    const strategy = new RelayStrategy();
    const result = await strategy.checkQuoteSupport({
      messenger,
      quotes: [quote],
      transaction: request.transaction,
    });

    expect(result).toStrictEqual({
      isSupported: false,
      validationError: {
        chainId: '0x1',
        code: 'quote_validation_unavailable',
        message: 'RPC down',
        strategy: TransactionPayStrategy.Relay,
        tokenAddress: '0xabc',
      },
    });
  });

  function buildQuote(): TransactionPayQuote<RelayQuote> {
    return {
      request: {
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
      },
      strategy: TransactionPayStrategy.Relay,
    } as TransactionPayQuote<RelayQuote>;
  }

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

  it('wraps execute errors with the Relay submit prefix', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: jest.fn(),
    } as PayStrategyExecuteRequest<RelayQuote>;

    submitRelayQuotesMock.mockRejectedValue(
      new Error('Relay execute: 422 - Insufficient liquidity'),
    );

    const strategy = new RelayStrategy();
    await expect(strategy.execute(executeRequest)).rejects.toThrow(
      'Relay submit: Relay execute: 422 - Insufficient liquidity',
    );
  });

  it('wraps non-Error throws with the Relay submit prefix', async () => {
    const executeRequest = {
      messenger,
      quotes: [],
      transaction: request.transaction,
      isSmartTransaction: jest.fn(),
    } as PayStrategyExecuteRequest<RelayQuote>;

    submitRelayQuotesMock.mockRejectedValue('boom');

    const strategy = new RelayStrategy();
    await expect(strategy.execute(executeRequest)).rejects.toThrow(
      'Relay submit: boom',
    );
  });
});
