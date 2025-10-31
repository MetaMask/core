import {
  TransactionStatus,
  type TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionControllerState } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { noop } from 'lodash';

import { parseRequiredTokens } from './required-tokens';
import {
  FINALIZED_STATUSES,
  getTransaction,
  pollTransactionChanges,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction';
import { getMessengerMock } from '../tests/messenger-mock';
import type { TransactionData, TransactionPayRequiredToken } from '../types';

jest.mock('./required-tokens');

const TRANSACTION_ID_MOCK = '123-456';
const ERROR_MESSAGE_MOCK = 'Test error';

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: {
    from: '0x123',
  },
} as TransactionMeta;

const TRANSCTION_TOKEN_REQUIRED_MOCK = {
  address: '0x456' as Hex,
  amountFiat: '2',
  amountUsd: '3',
  balanceFiat: '4',
  balanceUsd: '5',
} as TransactionPayRequiredToken;

describe('Transaction Utils', () => {
  const parseRequiredTokensMock = jest.mocked(parseRequiredTokens);
  const {
    messenger,
    getTransactionControllerStateMock,
    publish,
    updateTransactionMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTransactionControllerStateMock.mockReturnValue({
      transactions: [] as TransactionMeta[],
    } as TransactionControllerState);
  });

  describe('getTransaction', () => {
    it('returns transaction', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBe(TRANSACTION_META_MOCK);
    });

    it('returns undefined if transaction not found', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBeUndefined();
    });
  });

  describe('pollTransactionChanges', () => {
    it('updates state for new transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      pollTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

      const transactionData = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionData);

      expect(transactionData.tokens).toStrictEqual([
        TRANSCTION_TOKEN_REQUIRED_MOCK,
      ]);
    });

    it('updates state for updated transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);

      pollTransactionChanges(messenger, updateTransactionDataMock, noop);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            { ...TRANSACTION_META_MOCK, txParams: { data: '0x1' } },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(2);
    });

    it.each(FINALIZED_STATUSES)(
      'removes state if transaction status is %s',
      (status) => {
        const removeTransactionDataMock = jest.fn();

        pollTransactionChanges(messenger, noop, removeTransactionDataMock);

        publish(
          'TransactionController:stateChange',
          {
            transactions: [TRANSACTION_META_MOCK],
          } as TransactionControllerState,
          [],
        );

        publish(
          'TransactionController:stateChange',
          {
            transactions: [{ ...TRANSACTION_META_MOCK, status }],
          } as TransactionControllerState,
          [],
        );

        expect(removeTransactionDataMock).toHaveBeenCalledWith(
          TRANSACTION_ID_MOCK,
        );
      },
    );

    it('removes state if transaction is deleted', () => {
      const removeTransactionDataMock = jest.fn();

      pollTransactionChanges(messenger, noop, removeTransactionDataMock);

      publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [] as TransactionMeta[],
        } as TransactionControllerState,
        [],
      );

      expect(removeTransactionDataMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
      );
    });
  });

  describe('updateTransaction', () => {
    it('updates transaction', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      } as TransactionControllerState);

      updateTransaction(
        {
          transactionId: TRANSACTION_ID_MOCK,
          messenger: messenger as never,
          note: 'Test note',
        },
        (draft) => {
          draft.txParams.from = '0x456';
        },
      );

      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TRANSACTION_ID_MOCK,
          txParams: expect.objectContaining({
            from: '0x456',
          }),
        }),
        'Test note',
      );
    });

    it('throws if transaction not found', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [] as TransactionMeta[],
      } as TransactionControllerState);

      expect(() =>
        updateTransaction(
          {
            transactionId: TRANSACTION_ID_MOCK,
            messenger: messenger as never,
            note: 'Test note',
          },
          noop,
        ),
      ).toThrow(`Transaction not found: ${TRANSACTION_ID_MOCK}`);
    });
  });

  describe('waitForTransactionConfirmed', () => {
    it('resolves when transaction is confirmed', async () => {
      const promise = waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            { ...TRANSACTION_META_MOCK, status: TransactionStatus.confirmed },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(await promise).toBeUndefined();
    });

    it('rejects when transaction fails', async () => {
      const promise = waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      publish(
        'TransactionController:stateChange',
        {
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              error: {
                message: ERROR_MESSAGE_MOCK,
              },
              status: TransactionStatus.failed,
              type: TransactionType.bridge,
            },
          ],
        } as TransactionControllerState,
        [],
      );

      await expect(promise).rejects.toThrow(
        `Transaction failed - ${TransactionType.bridge} - ${ERROR_MESSAGE_MOCK}`,
      );
    });

    it('resolves if already confirmed', async () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [
          { ...TRANSACTION_META_MOCK, status: TransactionStatus.confirmed },
        ],
      } as TransactionControllerState);

      const result = await waitForTransactionConfirmed(
        TRANSACTION_ID_MOCK,
        messenger as never,
      );

      expect(result).toBeUndefined();
    });

    it('rejects if already failed', async () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            error: {
              message: ERROR_MESSAGE_MOCK,
            },
            status: TransactionStatus.failed,
            type: TransactionType.bridge,
          },
        ],
      } as TransactionControllerState);

      await expect(
        waitForTransactionConfirmed(TRANSACTION_ID_MOCK, messenger as never),
      ).rejects.toThrow(
        `Transaction failed - ${TransactionType.bridge} - ${ERROR_MESSAGE_MOCK}`,
      );
    });
  });
});
