import { Messenger } from '@metamask/base-controller';
import { StatusTypes } from '@metamask/bridge-controller';
import type { BridgeStatusController } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerActions } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerEvents } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerState } from '@metamask/bridge-status-controller';
import type { BridgeStatusControllerStateChangeEvent } from '@metamask/bridge-status-controller';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerUnapprovedTransactionAddedEvent } from '@metamask/transaction-controller';
import { cloneDeep, noop } from 'lodash';

import type { SubmitBridgeQuotesRequest } from './submit';
import { submitBridgeQuotes } from './submit';
import type { TransactionBridgeQuote } from '../types';

const FROM_MOCK = '0x123';
const CHAIN_ID_MOCK = toHex(123);
const BRIDGE_TRANSACTION_ID_MOCK = '456-789';
const BRIDGE_TRANSACTION_ID_2_MOCK = '789-012';

const QUOTE_MOCK = {
  quote: {
    srcChainId: 123,
  },
  trade: { gasLimit: 2000 },
} as TransactionBridgeQuote;

const QUOTE_2_MOCK = {
  ...QUOTE_MOCK,
  approval: { gasLimit: 3000 },
} as TransactionBridgeQuote;

const BRIDGE_TRANSACTION_META_MOCK = {
  id: BRIDGE_TRANSACTION_ID_MOCK,
} as TransactionMeta;

const BRIDGE_TRANSACTION_META_2_MOCK = {
  id: BRIDGE_TRANSACTION_ID_2_MOCK,
} as TransactionMeta;

describe('Submit Utils', () => {
  let messengerMock: Messenger<
    BridgeStatusControllerActions,
    | BridgeStatusControllerEvents
    | TransactionControllerUnapprovedTransactionAddedEvent
  >;

  let request: SubmitBridgeQuotesRequest;

  const submitTransactionMock: jest.MockedFunction<
    BridgeStatusController['submitTx']
  > = jest.fn();

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
    messengerMock.publish(
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
    messengerMock.publish('TransactionController:unapprovedTransactionAdded', {
      id,
      chainId: CHAIN_ID_MOCK,
      txParams: {
        from: FROM_MOCK,
      },
    } as unknown as TransactionMeta);
  }

  beforeEach(() => {
    jest.resetAllMocks();

    messengerMock = new Messenger<
      BridgeStatusControllerActions,
      | BridgeStatusControllerStateChangeEvent
      | TransactionControllerUnapprovedTransactionAddedEvent
    >();

    messengerMock.registerActionHandler(
      'BridgeStatusController:submitTx',
      submitTransactionMock,
    );

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

    request = {
      from: FROM_MOCK,
      isSmartTransaction: false,
      messenger: messengerMock,
      quotes: cloneDeep([QUOTE_MOCK, QUOTE_2_MOCK]),
      updateTransaction: noop,
    };
  });

  describe('submitBridgeQuotes', () => {
    it('submits matching quotes to bridge status controller', async () => {
      await submitBridgeQuotes(request);

      expect(submitTransactionMock).toHaveBeenCalledWith(QUOTE_MOCK, false);
      expect(submitTransactionMock).toHaveBeenCalledWith(QUOTE_2_MOCK, false);
    });

    it('indicates if smart transactions is enabled', async () => {
      request.isSmartTransaction = true;

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining(QUOTE_MOCK),
        true,
      );
      expect(submitTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining(QUOTE_2_MOCK),
        true,
      );
    });

    it('does nothing if no matching quotes', async () => {
      request.quotes = [];

      await submitBridgeQuotes(request);

      expect(submitTransactionMock).not.toHaveBeenCalled();
    });

    it('does nothing if first quote has same source and target chain', async () => {
      request.quotes[0].quote.destChainId = QUOTE_MOCK.quote.srcChainId;

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
        'Bridge transaction failed',
      );
    });

    it('updates required transaction IDs', async () => {
      const updateTransactionMock = jest.fn();
      request.updateTransaction = updateTransactionMock;

      await submitBridgeQuotes(request);

      const transactionMetaMock = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][0](transactionMetaMock);
      updateTransactionMock.mock.calls[1][0](transactionMetaMock);

      expect(transactionMetaMock.requiredTransactionIds).toStrictEqual([
        BRIDGE_TRANSACTION_ID_MOCK,
        BRIDGE_TRANSACTION_ID_2_MOCK,
      ]);
    });

    it('does not update required transaction IDs if chain ID does not match', async () => {
      const updateTransactionMock = jest.fn();
      request.updateTransaction = updateTransactionMock;
      request.quotes[0].quote.srcChainId = 321;

      await submitBridgeQuotes(request);

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('does not update required transaction IDs if from does not match', async () => {
      const updateTransactionMock = jest.fn();
      request.updateTransaction = updateTransactionMock;
      request.from = '0x456';

      await submitBridgeQuotes(request);

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });
  });
});
