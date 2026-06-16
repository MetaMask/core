import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import { validateRelayQuoteSupport } from './relay-validation';
import { RelayStrategy } from './RelayStrategy';
import type { RelayQuote } from './types';

jest.mock('./relay-quotes');
jest.mock('./relay-submit');
jest.mock('./relay-validation');
jest.mock('../../utils/feature-flags');

describe('RelayStrategy', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);
  const validateRelayQuoteSupportMock = jest.mocked(validateRelayQuoteSupport);

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
    validateRelayQuoteSupportMock.mockResolvedValue({ isSupported: true });
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

  it('delegates checkQuoteSupport', async () => {
    const quote = buildQuote();
    const supportResult = {
      isSupported: false,
      validationError: 'RPC down',
    };

    validateRelayQuoteSupportMock.mockResolvedValue(supportResult);

    const strategy = new RelayStrategy();
    const checkRequest = {
      messenger,
      quotes: [quote],
      transaction: request.transaction,
    };
    const result = await strategy.checkQuoteSupport(checkRequest);

    expect(result).toStrictEqual(supportResult);
    expect(validateRelayQuoteSupportMock).toHaveBeenCalledWith(checkRequest);
  });

  function buildQuote(
    requestOverrides: Partial<TransactionPayQuote<RelayQuote>['request']> = {},
  ): TransactionPayQuote<RelayQuote> {
    return {
      request: {
        sourceChainId: '0x1' as Hex,
        sourceTokenAddress: '0xabc' as Hex,
        ...requestOverrides,
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
