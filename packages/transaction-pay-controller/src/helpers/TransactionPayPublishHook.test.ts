import type {
  PublishHookResult,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { TransactionPayPublishHook } from './TransactionPayPublishHook';
import { TransactionPayStrategy } from '..';
import { TestStrategy } from '../strategy/test/TestStrategy';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionPayControllerState,
  TransactionPayQuote,
} from '../types';

jest.mock('../strategy/test/TestStrategy');

const TRANSACTION_META_MOCK = {
  id: '123-456',
  txParams: {
    from: '0xabc',
  },
} as TransactionMeta;

const QUOTE_MOCK = {} as TransactionPayQuote<unknown>;

describe('TransactionPayPublishHook', () => {
  const isSmartTransactionMock = jest.fn();
  const executeMock = jest.fn();

  const { messenger, getControllerStateMock, getStrategyMock } =
    getMessengerMock();

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

    jest.mocked(TestStrategy).mockReturnValue({
      execute: executeMock,
      getQuotes: jest.fn(),
    } as unknown as TestStrategy);

    isSmartTransactionMock.mockReturnValue(false);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          quotes: [QUOTE_MOCK, QUOTE_MOCK],
        },
      },
    } as TransactionPayControllerState);

    getStrategyMock.mockReturnValue(TransactionPayStrategy.Test);
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
});
