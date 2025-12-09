import { StatusTypes } from '@metamask/bridge-controller';
import type { BridgeStatusControllerState } from '@metamask/bridge-status-controller';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { createDeferredPromise } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { refreshQuote } from './bridge-quotes';
import type { SubmitBridgeQuotesRequest } from './bridge-submit';
import { submitBridgeQuotes } from './bridge-submit';
import type { TransactionPayBridgeQuote } from './types';
import { getMessengerMock } from '../../tests/messenger-mock';
import type { TransactionPayQuote } from '../../types';
import {
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

jest.mock('./bridge-quotes');

jest.mock('../../utils/transaction', () => ({
  ...jest.requireActual('../../utils/transaction'),
  updateTransaction: jest.fn(),
  waitForTransactionConfirmed: jest.fn(),
}));

const FROM_MOCK = '0x123';
const CHAIN_ID_MOCK = toHex(123);
const TRANSACTION_ID_MOCK = '123-456';
const BRIDGE_TRANSACTION_ID_MOCK = '456-789';
const BRIDGE_TRANSACTION_ID_2_MOCK = '789-012';

const QUOTE_MOCK = {
  original: {
    quote: {
      srcChainId: 123,
    },
    trade: { gasLimit: 2000 },
  },
} as TransactionPayQuote<TransactionPayBridgeQuote>;

const QUOTE_2_MOCK = {
  ...QUOTE_MOCK,
  original: {
    ...QUOTE_MOCK.original,
    approval: { gasLimit: 3000 },
  },
} as TransactionPayQuote<TransactionPayBridgeQuote>;

const BRIDGE_TRANSACTION_META_MOCK = {
  id: BRIDGE_TRANSACTION_ID_MOCK,
} as TransactionMeta;

const BRIDGE_TRANSACTION_META_2_MOCK = {
  id: BRIDGE_TRANSACTION_ID_2_MOCK,
} as TransactionMeta;

describe('Bridge Submit Utils', () => {
  let request: SubmitBridgeQuotesRequest;

  const updateTransactionMock = jest.mocked(updateTransaction);
  const refreshQuoteMock = jest.mocked(refreshQuote);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  const {
    getBridgeStatusControllerStateMock,
    messenger,
    publish,
    submitTransactionMock,
  } = getMessengerMock();

  /**
   * Simulate the bridge status controller state change event.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param status - The new status to set.
   */
  function updateBridgeStatus(
    transactionId: string,
    status: StatusTypes,
  ): void {
    publish(
      'BridgeStatusController:stateChange',
      {
        txHistory: {
          [transactionId]: {
            status: {
              status,
            },
          },
        },
      } as unknown as BridgeStatusControllerState,
      [],
    );
  }

  /**
   * Simulate adding an unapproved transaction.
   *
   * @param id - The ID of the transaction to add.
   */
  function addUnapprovedTransaction(id: string): void {
    publish('TransactionController:unapprovedTransactionAdded', {
      id,
      chainId: CHAIN_ID_MOCK,
      txParams: {
        from: FROM_MOCK,
      },
    } as unknown as TransactionMeta);
  }

  beforeEach(() => {
    jest.resetAllMocks();

    submitTransactionMock.mockImplementationOnce(async () => {
      setTimeout(() => {
        updateBridgeStatus(BRIDGE_TRANSACTION_ID_MOCK, StatusTypes.COMPLETE);
      }, 0);

      addUnapprovedTransaction(BRIDGE_TRANSACTION_ID_MOCK);

      return BRIDGE_TRANSACTION_META_MOCK;
    });

    submitTransactionMock.mockImplementationOnce(async () => {
      setTimeout(() => {
        updateBridgeStatus(BRIDGE_TRANSACTION_ID_2_MOCK, StatusTypes.COMPLETE);
      }, 0);

      addUnapprovedTransaction(BRIDGE_TRANSACTION_ID_2_MOCK);

      return BRIDGE_TRANSACTION_META_2_MOCK;
    });

    refreshQuoteMock.mockImplementation(async (quote) => quote.original);

    getBridgeStatusControllerStateMock.mockReturnValue({
      txHistory: {},
    } as BridgeStatusControllerState);

    waitForTransactionConfirmedMock.mockResolvedValue();

    request = {
      from: FROM_MOCK,
      isSmartTransaction: (): boolean => false,
      messenger,
      quotes: cloneDeep([QUOTE_MOCK, QUOTE_2_MOCK]),
      transaction: { id: TRANSACTION_ID_MOCK } as TransactionMeta,
    };
  });

  describe('submitBridgeQuotes', () => {
    it('submits matching quotes to bridge status controller', async () => {
      await submitBridgeQuotes(request);

      expect(submitTransactionMock).toHaveBeenCalledWith(
        FROM_MOCK,
        expect.objectContaining(QUOTE_MOCK.original),
        false,
      );

      expect(submitTransactionMock).toHaveBeenCalledWith(
        FROM_MOCK,
        expect.objectContaining(QUOTE_2_MOCK.original),
        false,
      );
    });

    it('indicates if smart transactions is enabled', async () => {
      request.isSmartTransaction = (): boolean => true;

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).toHaveBeenCalledWith(
        FROM_MOCK,
        expect.objectContaining(QUOTE_MOCK.original),
        true,
      );

      expect(submitTransactionMock).toHaveBeenCalledWith(
        FROM_MOCK,
        expect.objectContaining(QUOTE_2_MOCK.original),
        true,
      );
    });

    it('does nothing if no matching quotes', async () => {
      request.quotes = [];

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).not.toHaveBeenCalled();
    });

    it('does nothing if first quote has same source and target chain', async () => {
      request.quotes[0].original.quote.destChainId =
        QUOTE_MOCK.original.quote.srcChainId;

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).not.toHaveBeenCalled();
    });

    it('throws if bridge status is failed', async () => {
      submitTransactionMock.mockReset();
      submitTransactionMock.mockImplementation(async () => {
        setTimeout(() => {
          updateBridgeStatus(BRIDGE_TRANSACTION_ID_MOCK, StatusTypes.FAILED);
        }, 0);

        return BRIDGE_TRANSACTION_META_MOCK;
      });

      await expect(submitBridgeQuotes(request)).rejects.toThrow(
        'Bridge failed',
      );
    });

    it('updates required transaction IDs', async () => {
      await submitBridgeQuotes(request);

      const transactionMetaMock = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][1](transactionMetaMock);
      updateTransactionMock.mock.calls[1][1](transactionMetaMock);

      expect(transactionMetaMock.requiredTransactionIds).toStrictEqual([
        BRIDGE_TRANSACTION_ID_MOCK,
        BRIDGE_TRANSACTION_ID_2_MOCK,
      ]);
    });

    it('does not update required transaction IDs if chain ID does not match', async () => {
      request.quotes[0].original.quote.srcChainId = 321;

      await submitBridgeQuotes(request);

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('does not update required transaction IDs if from does not match', async () => {
      request.from = '0x456';

      await submitBridgeQuotes(request);

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('refreshes quotes after the first', async () => {
      await submitBridgeQuotes(request);

      expect(refreshQuoteMock).toHaveBeenCalledTimes(1);
      expect(refreshQuoteMock).toHaveBeenCalledWith(
        request.quotes[1],
        messenger,
        request.transaction,
      );
    });

    it('does not throw if refresh fails', async () => {
      refreshQuoteMock.mockRejectedValueOnce(new Error('Refresh failed'));

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).toHaveBeenCalledTimes(2);
    });

    it('resolves immediately if bridge status already completed', async () => {
      getBridgeStatusControllerStateMock.mockReturnValue({
        txHistory: {
          [BRIDGE_TRANSACTION_ID_MOCK as never]: {
            status: {
              status: StatusTypes.COMPLETE,
            },
          },
        },
      } as BridgeStatusControllerState);

      const result = await submitBridgeQuotes(request);

      expect(result).toBeUndefined();
    });

    it('waits for transaction confirmation', async () => {
      getBridgeStatusControllerStateMock.mockReturnValue({
        txHistory: {
          [BRIDGE_TRANSACTION_ID_MOCK as never]: {
            status: {
              status: StatusTypes.COMPLETE,
            },
          },
        },
      } as BridgeStatusControllerState);

      submitTransactionMock.mockReset();
      submitTransactionMock.mockImplementation(async () => {
        addUnapprovedTransaction(BRIDGE_TRANSACTION_ID_MOCK);

        updateTransactionMock.mock.calls[0][1](BRIDGE_TRANSACTION_META_MOCK);

        return BRIDGE_TRANSACTION_META_MOCK;
      });

      const promise = createDeferredPromise();
      waitForTransactionConfirmedMock.mockReturnValue(promise.promise);

      request.quotes = [QUOTE_MOCK];

      const submitPromise = submitBridgeQuotes(request);

      promise.resolve();

      const result = await submitPromise;
      expect(result).toBeUndefined();
    });
  });
});
