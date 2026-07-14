import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash';

import type { TransactionData, TransactionFiatPayment } from '../types';
import { getTransaction } from '../utils/transaction';
import { updateFiatPayment } from './update-fiat-payment';

jest.mock('../utils/transaction');

const TRANSACTION_ID_MOCK = '123-456';
const FROM_MOCK = '0x456';

describe('Update Fiat Payment Action', () => {
  const getTransactionMock = jest.mocked(getTransaction);

  beforeEach(() => {
    jest.resetAllMocks();

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: FROM_MOCK },
    } as TransactionMeta);
  });

  it('updates only selected payment method id', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        transactionId: TRANSACTION_ID_MOCK,
        callback: (fiatPayment) => {
          fiatPayment.selectedPaymentMethodId = '/payments/debit-credit-card';
        },
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {
      fiatPayment: {
        amountFiat: '20',
        selectedPaymentMethodId: '/payments/bank-transfer',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amountFiat: '20',
      selectedPaymentMethodId: '/payments/debit-credit-card',
    });
  });

  it('updates amount without resetting other fiat fields', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        transactionId: TRANSACTION_ID_MOCK,
        callback: (fiatPayment) => {
          fiatPayment.amountFiat = '100';
        },
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {
      fiatPayment: {
        amountFiat: '20',
        selectedPaymentMethodId: '/payments/debit-credit-card',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amountFiat: '100',
      selectedPaymentMethodId: '/payments/debit-credit-card',
    });
  });

  it('initializes fiat payment state when missing', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        transactionId: TRANSACTION_ID_MOCK,
        callback: (fiatPayment) => {
          fiatPayment.amountFiat = '5';
          fiatPayment.selectedPaymentMethodId = '/payments/bank-transfer';
        },
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amountFiat: '5',
      selectedPaymentMethodId: '/payments/bank-transfer',
    });
  });

  it('supports explicit callback-style mutation', () => {
    const updateTransactionDataMock = jest.fn();
    const callback = jest.fn((fiatPayment: TransactionFiatPayment) => {
      fiatPayment.amountFiat = '12';
    });

    updateFiatPayment(
      {
        transactionId: TRANSACTION_ID_MOCK,
        callback,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {
      fiatPayment: {
        amountFiat: '20',
        selectedPaymentMethodId: '/payments/debit-credit-card',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);
    expect(callback).toHaveBeenCalledWith(transactionDataMock.fiatPayment);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amountFiat: '12',
      selectedPaymentMethodId: '/payments/debit-credit-card',
    });
  });

  it('throws if transaction not found', () => {
    getTransactionMock.mockReturnValue(undefined);

    expect(() =>
      updateFiatPayment(
        {
          transactionId: TRANSACTION_ID_MOCK,
          callback: () => undefined,
        },
        {
          messenger: {} as never,
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Transaction not found');
  });
});
