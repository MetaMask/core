import type {
  PublishHookResult,
  TransactionMeta,
  TransactionControllerState,
} from '@metamask/transaction-controller';

import { TransactionPayPublishHook } from './TransactionPayPublishHook';
import { TransactionPayStrategy } from '..';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionPayControllerState,
  TransactionPayQuote,
} from '../types';
import { getStrategies, getStrategyByName } from '../utils/strategy';

jest.mock('../utils/strategy');

const TRANSACTION_META_MOCK = {
  id: '123-456',
  txParams: {
    from: '0xabc',
  },
} as TransactionMeta;

const QUOTE_MOCK = {
  strategy: TransactionPayStrategy.Test,
} as TransactionPayQuote<unknown>;

describe('TransactionPayPublishHook', () => {
  const isSmartTransactionMock = jest.fn();
  const executeMock = jest.fn();
  const getStrategiesUtilMock = jest.mocked(getStrategies);
  const getStrategyByNameMock = jest.mocked(getStrategyByName);

  const {
    messenger,
    getControllerStateMock,
    getTransactionControllerStateMock,
    updateTransactionMock,
  } = getMessengerMock();

  let hook: TransactionPayPublishHook;

  /**
   * Run the publish hook.
   *
   * @returns  The result of the publish hook.
   */
  function runHook(): Promise<PublishHookResult> {
    return hook.getHook()(TRANSACTION_META_MOCK, '0x1234');
  }

  beforeEach(() => {
    jest.resetAllMocks();

    hook = new TransactionPayPublishHook({
      isSmartTransaction: isSmartTransactionMock,
      messenger,
    });

    getStrategyByNameMock.mockReturnValue({
      execute: executeMock,
      getQuotes: jest.fn(),
    } as never);

    executeMock.mockImplementation(async (request) => {
      request.onSubmitted?.(400);
      return { transactionHash: '0xhash' };
    });

    isSmartTransactionMock.mockReturnValue(false);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          quotes: [QUOTE_MOCK, QUOTE_MOCK],
        },
      },
    } as TransactionPayControllerState);

    getStrategiesUtilMock.mockReturnValue([]);

    getTransactionControllerStateMock.mockReturnValue({
      transactions: [TRANSACTION_META_MOCK],
    } as TransactionControllerState);
  });

  it('executes strategy with quotes', async () => {
    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [QUOTE_MOCK, QUOTE_MOCK],
      }),
    );
  });

  it('does nothing if no quotes in state', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {},
    });

    await runHook();

    expect(executeMock).not.toHaveBeenCalled();
  });

  it('throws errors from submit', async () => {
    executeMock.mockRejectedValue(new Error('Test error'));

    await expect(runHook()).rejects.toThrow('Test error');
  });

  it('stores execution latency in metadata', async () => {
    await runHook();

    expect(updateTransactionMock).toHaveBeenCalled();
    const updatedTx = updateTransactionMock.mock.calls[0][0];
    expect(updatedTx.metamaskPay?.executionLatencyMs).toBe(400);
  });

  it('records execution latency only once', async () => {
    executeMock.mockImplementation(async (request) => {
      request.onSubmitted?.(400);
      request.onSubmitted?.(900);
      return { transactionHash: '0xhash' };
    });

    await runHook();

    expect(updateTransactionMock).toHaveBeenCalledTimes(1);
    const updatedTx = updateTransactionMock.mock.calls[0][0];
    expect(updatedTx.metamaskPay?.executionLatencyMs).toBe(400);
  });

  it('swallows errors when updating execution metrics', async () => {
    updateTransactionMock.mockImplementation(() => {
      throw new Error('Update failed');
    });
    executeMock.mockImplementation(async (request) => {
      request.onSubmitted?.(123);
      return { transactionHash: '0xhash' };
    });

    const result = await runHook();

    expect(result).toStrictEqual({
      transactionHash: '0xhash',
    });
    expect(updateTransactionMock).toHaveBeenCalled();
  });

  it('falls back to the next compatible strategy when primary fails', async () => {
    class PrimaryStrategy {}
    class UnsupportedStrategy {}
    class EmptyStrategy {}
    class ErrorStrategy {}
    class FallbackStrategy {}

    const primaryStrategy = {
      constructor: PrimaryStrategy,
      execute: jest.fn().mockRejectedValue(new Error('Primary error')),
    };

    const unsupportedStrategy = {
      constructor: UnsupportedStrategy,
      supports: jest.fn().mockReturnValue(false),
      getQuotes: jest.fn(),
      execute: jest.fn(),
    };

    const emptyStrategy = {
      constructor: EmptyStrategy,
      supports: jest.fn().mockReturnValue(true),
      getQuotes: jest.fn().mockResolvedValue([]),
      execute: jest.fn(),
    };

    const errorStrategy = {
      constructor: ErrorStrategy,
      supports: jest.fn().mockReturnValue(true),
      getQuotes: jest.fn().mockRejectedValue(new Error('Quote error')),
      execute: jest.fn(),
    };

    const fallbackStrategy = {
      constructor: FallbackStrategy,
      supports: jest.fn().mockReturnValue(true),
      getQuotes: jest.fn().mockResolvedValue([QUOTE_MOCK]),
      execute: jest.fn().mockImplementation(async (request) => {
        request.onSubmitted?.(250);
        return { transactionHash: '0xfallback' };
      }),
    };

    getStrategyByNameMock.mockReturnValue(primaryStrategy as never);
    getStrategiesUtilMock.mockReturnValue([
      primaryStrategy as never,
      unsupportedStrategy as never,
      emptyStrategy as never,
      errorStrategy as never,
      fallbackStrategy as never,
    ]);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          isLoading: false,
          quotes: [QUOTE_MOCK],
          isMaxAmount: false,
          paymentToken: {
            address: '0x123',
            balanceRaw: '100',
            chainId: '0x1',
          },
          sourceAmounts: [
            {
              sourceAmountRaw: '100',
              targetTokenAddress: '0x456',
            },
          ],
          tokens: [
            {
              address: '0x456',
              allowUnderMinimum: false,
              amountRaw: '100',
              chainId: '0x2',
            },
          ],
        },
      },
    } as unknown as TransactionPayControllerState);

    const result = await runHook();

    expect(result).toStrictEqual({
      transactionHash: '0xfallback',
    });

    expect(unsupportedStrategy.getQuotes).not.toHaveBeenCalled();
    expect(emptyStrategy.getQuotes).toHaveBeenCalled();
    expect(errorStrategy.getQuotes).toHaveBeenCalled();
    expect(fallbackStrategy.execute).toHaveBeenCalled();
    expect(updateTransactionMock).toHaveBeenCalled();
  });

  it('throws the original error when no fallback succeeds', async () => {
    class PrimaryStrategy {}
    class UnsupportedStrategy {}
    class EmptyStrategy {}

    const primaryError = new Error('Primary error');
    const primaryStrategy = {
      constructor: PrimaryStrategy,
      execute: jest.fn().mockRejectedValue(primaryError),
    };

    const unsupportedStrategy = {
      constructor: UnsupportedStrategy,
      supports: jest.fn().mockReturnValue(false),
      getQuotes: jest.fn(),
      execute: jest.fn(),
    };

    const emptyStrategy = {
      constructor: EmptyStrategy,
      supports: jest.fn().mockReturnValue(true),
      getQuotes: jest.fn().mockResolvedValue([]),
      execute: jest.fn(),
    };

    getStrategyByNameMock.mockReturnValue(primaryStrategy as never);
    getStrategiesUtilMock.mockReturnValue([
      primaryStrategy as never,
      unsupportedStrategy as never,
      emptyStrategy as never,
    ]);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          isLoading: false,
          quotes: [QUOTE_MOCK],
          isMaxAmount: false,
          paymentToken: {
            address: '0x123',
            balanceRaw: '100',
            chainId: '0x1',
          },
          sourceAmounts: [
            {
              sourceAmountRaw: '100',
              targetTokenAddress: '0x456',
            },
          ],
          tokens: [
            {
              address: '0x456',
              allowUnderMinimum: false,
              amountRaw: '100',
              chainId: '0x2',
            },
          ],
        },
      },
    } as unknown as TransactionPayControllerState);

    await expect(runHook()).rejects.toThrow(primaryError);
  });
});
