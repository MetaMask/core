import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash';

import { updateFiatPayment } from './update-fiat-payment';
import type { TransactionData } from '../types';
import { getTransaction } from '../utils/transaction';

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
        selectedPaymentMethodId: '/payments/debit-credit-card',
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {
      fiatPayment: {
        amount: '20',
        quickBuyOrderId: '/providers/transak/orders/order-id-1',
        selectedPaymentMethodId: '/payments/bank-transfer',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amount: '20',
      quickBuyOrderId: '/providers/transak/orders/order-id-1',
      selectedPaymentMethodId: '/payments/debit-credit-card',
    });
  });

  it('updates amount without resetting other fiat fields', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        amount: '100',
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {
      fiatPayment: {
        amount: '20',
        quickBuyOrderId: '/providers/transak/orders/order-id-1',
        selectedPaymentMethodId: '/payments/debit-credit-card',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amount: '100',
      quickBuyOrderId: '/providers/transak/orders/order-id-1',
      selectedPaymentMethodId: '/payments/debit-credit-card',
    });
  });

  it('initializes fiat payment state when missing', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        amount: '5',
        quickBuyOrderId: '/providers/transak/orders/order-id-2',
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amount: '5',
      quickBuyOrderId: '/providers/transak/orders/order-id-2',
      selectedPaymentMethodId: null,
    });
  });

  it('supports clearing fields with null values', () => {
    const updateTransactionDataMock = jest.fn();

    updateFiatPayment(
      {
        selectedPaymentMethodId: null,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    const transactionDataMock = {
      fiatPayment: {
        amount: '20',
        quickBuyOrderId: '/providers/transak/orders/order-id-1',
        selectedPaymentMethodId: '/payments/debit-credit-card',
      },
    } as TransactionData;

    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.fiatPayment).toStrictEqual({
      amount: '20',
      quickBuyOrderId: '/providers/transak/orders/order-id-1',
      selectedPaymentMethodId: null,
    });
  });

  it('throws if transaction not found', () => {
    getTransactionMock.mockReturnValue(undefined);

    expect(() =>
      updateFiatPayment(
        {
          amount: '10',
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: {} as never,
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Transaction not found');
  });
});
