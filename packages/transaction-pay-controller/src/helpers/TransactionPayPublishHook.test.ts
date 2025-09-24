import { Messenger } from '@metamask/base-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';

import { TransactionPayPublishHook } from './TransactionPayPublishHook';
import type { TransactionPayPublishHookMessenger } from './TransactionPayPublishHook';
import type {
  TransactionBridgeQuote,
  TransactionPayControllerGetStateAction,
} from '../types';
import { submitBridgeQuotes } from '../utils/submit';
import { get } from 'lodash';

jest.mock('../utils/submit');

const TRANSACTION_META_MOCK = {
  id: '123-456',
  txParams: {
    from: '0xabc',
  },
} as TransactionMeta;

const QUOTE_MOCK = {} as TransactionBridgeQuote;

/**
 *
 */

describe('TransactionPayPublishHook', () => {
  const submitBridgeQuotesMock = jest.mocked(submitBridgeQuotes);
  const isSmartTransactionMock = jest.fn();
  const getControllerStateMock = jest.fn();

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

    submitBridgeQuotesMock.mockResolvedValue(undefined);

    messenger.registerActionHandler('TransactionPayController:getState', () =>
      getControllerStateMock(),
    );

    isSmartTransactionMock.mockReturnValue(false);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          quotes: [QUOTE_MOCK, QUOTE_MOCK],
        },
      },
    });
  });

  it('submits bridge quotes matching transaction ID', async () => {
    await runHook();

    expect(submitBridgeQuotesMock).toHaveBeenCalledWith({
      from: TRANSACTION_META_MOCK.txParams.from as string,
      isSmartTransaction: false,
      messenger,
      quotes: [QUOTE_MOCK, QUOTE_MOCK],
      updateTransaction: expect.any(Function),
    });
  });

  it('submits if no quotes', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {},
      },
    });

    await runHook();

    expect(submitBridgeQuotesMock).toHaveBeenCalled();
  });

  it('uses callback to determine if smart transaction', async () => {
    isSmartTransactionMock.mockReturnValue(true);

    await runHook();

    expect(submitBridgeQuotesMock).toHaveBeenCalledWith({
      from: TRANSACTION_META_MOCK.txParams.from as string,
      isSmartTransaction: true,
      messenger,
      quotes: [QUOTE_MOCK, QUOTE_MOCK],
      updateTransaction: expect.any(Function),
    });
  });

  it('returns empty result', async () => {
    const result = await runHook();

    expect(result).toStrictEqual({ transactionHash: undefined });
  });

  it('throws errors from submit', async () => {
    submitBridgeQuotesMock.mockRejectedValue(new Error('Test error'));

    await expect(runHook()).rejects.toThrow('Test error');
  });
});
