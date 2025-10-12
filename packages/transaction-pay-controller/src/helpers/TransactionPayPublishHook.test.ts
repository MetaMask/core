import { Messenger } from '@metamask/base-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';

import { TransactionPayPublishHook } from './TransactionPayPublishHook';
import type { TransactionPayPublishHookMessenger } from './TransactionPayPublishHook';
import { TransactionPayStrategy } from '../constants';
import { TestStrategy } from '../strategy/test/TestStrategy';
import type {
  TransactionPayControllerGetStateAction,
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
  const getControllerStateMock = jest.fn();
  const executeMock = jest.fn();

  let messenger: TransactionPayPublishHookMessenger;
  let hook: TransactionPayPublishHook;

  /**
   * Run the publish hook.
   *
   * @returns  The result of the publish hook.
   */
  function runHook() {
    return hook.getHook()(TRANSACTION_META_MOCK, '0x1234');
  }

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = new Messenger<
      BridgeStatusControllerActions | TransactionPayControllerGetStateAction,
      | BridgeStatusControllerStateChangeEvent
      | TransactionControllerUnapprovedTransactionAddedEvent
    >();

    hook = new TransactionPayPublishHook({
      isSmartTransaction: isSmartTransactionMock,
      messenger,
    });

    messenger.registerActionHandler('TransactionPayController:getState', () =>
      getControllerStateMock(),
    );

    messenger.registerActionHandler(
      'TransactionPayController:getStrategy',
      async () => TransactionPayStrategy.Test,
    );

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
    });
  });

  it('executes strategy with quotes', async () => {
    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [QUOTE_MOCK, QUOTE_MOCK],
      }),
    );
  });

  it('returns empty result', async () => {
    const result = await runHook();

    expect(result).toStrictEqual({ transactionHash: undefined });
  });

  it('throws errors from submit', async () => {
    executeMock.mockRejectedValue(new Error('Test error'));

    await expect(runHook()).rejects.toThrow('Test error');
  });
});
