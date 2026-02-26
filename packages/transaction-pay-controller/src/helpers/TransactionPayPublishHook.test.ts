import type {
  PublishHookResult,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { TransactionPayPublishHook } from './TransactionPayPublishHook';
import { TransactionPayStrategy } from '..';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionPayControllerState,
  TransactionPayQuote,
} from '../types';
import { getStrategyByName } from '../utils/strategy';

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
  const getStrategyByNameMock = jest.mocked(getStrategyByName);

  const { messenger, getControllerStateMock } = getMessengerMock();

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
  });

  it('executes strategy with quotes', async () => {
    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [QUOTE_MOCK, QUOTE_MOCK],
      }),
    );
  });

  it('selects strategy from quote', async () => {
    await runHook();

    expect(getStrategyByNameMock).toHaveBeenCalledWith(QUOTE_MOCK.strategy);
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
});
