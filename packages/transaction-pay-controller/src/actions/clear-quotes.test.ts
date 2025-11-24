import { clearQuotes, getAbortSignal } from './clear-quotes';
import type { TransactionData } from '../types';

const TRANSACTION_ID_MOCK = '123-456';
const REASON_MOCK = 'Test reason';

describe('Clear Quotes Action', () => {
  it('removes quotes from state', () => {
    const updateTransactionDataMock = jest.fn();

    clearQuotes(
      {
        transactionId: TRANSACTION_ID_MOCK,
        reason: 'User requested clear',
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {
      isLoading: true,
      quotes: [{}],
      sourceAmounts: {},
      totals: {},
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock).toStrictEqual({
      isLoading: false,
      quotes: undefined,
      sourceAmounts: undefined,
      totals: undefined,
    });
  });

  it('aborts signal for the transaction with default reason', () => {
    const abortMock = jest.fn();

    jest
      .spyOn(AbortController.prototype, 'abort')
      .mockImplementation(abortMock);

    clearQuotes(
      {
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: jest.fn(),
      },
    );

    expect(abortMock).toHaveBeenCalledWith('Clear quotes action');
  });

  it('aborts signal for the transaction with provided reason', () => {
    const abortMock = jest.fn();

    jest
      .spyOn(AbortController.prototype, 'abort')
      .mockImplementation(abortMock);

    clearQuotes(
      {
        transactionId: TRANSACTION_ID_MOCK,
        reason: REASON_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: jest.fn(),
      },
    );

    expect(abortMock).toHaveBeenCalledWith(REASON_MOCK);
  });

  describe('getAbortSignal', () => {
    it('returns an AbortSignal instance', () => {
      const signal = getAbortSignal(TRANSACTION_ID_MOCK);
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });
});
