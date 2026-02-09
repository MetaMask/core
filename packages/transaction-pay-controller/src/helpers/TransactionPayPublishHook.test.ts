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
      execute: jest.fn().mockResolvedValue({ transactionHash: '0xfallback' }),
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

  it('throws original error when supports throws for fallback strategies', async () => {
    class PrimaryStrategy {}
    class SupportsErrorStrategy {}

    const primaryError = new Error('Primary error');
    const primaryStrategy = {
      constructor: PrimaryStrategy,
      execute: jest.fn().mockRejectedValue(primaryError),
    };

    const supportsErrorStrategy = {
      constructor: SupportsErrorStrategy,
      supports: jest.fn().mockImplementation(() => {
        throw new Error('Supports error');
      }),
      getQuotes: jest.fn(),
      execute: jest.fn(),
    };

    getStrategyByNameMock.mockReturnValue(primaryStrategy as never);
    getStrategiesUtilMock.mockReturnValue([
      primaryStrategy as never,
      supportsErrorStrategy as never,
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
    expect(supportsErrorStrategy.getQuotes).not.toHaveBeenCalled();
  });
});
