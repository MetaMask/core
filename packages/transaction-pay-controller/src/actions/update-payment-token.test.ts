import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash';

import { updatePaymentToken } from './update-payment-token';
import type { TransactionData, TransactionPaymentToken } from '../types';
import { buildTokenData } from '../utils/token';
import { getTransaction } from '../utils/transaction';

jest.mock('../utils/token');
jest.mock('../utils/transaction');

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';
const TRANSACTION_ID_MOCK = '123-456';

const PAYMENT_TOKEN_MOCK: TransactionPaymentToken = {
  address: TOKEN_ADDRESS_MOCK,
  balanceFiat: '2.46',
  balanceHuman: '1.23',
  balanceRaw: '1230000',
  balanceUsd: '3.69',
  chainId: CHAIN_ID_MOCK,
  decimals: 6,
  symbol: 'TST',
};

describe('Update Payment Token Action', () => {
  const buildTokenDataMock = jest.mocked(buildTokenData);
  const getTransactionMock = jest.mocked(getTransaction);

  beforeEach(() => {
    jest.resetAllMocks();

    buildTokenDataMock.mockReturnValue(PAYMENT_TOKEN_MOCK);

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: FROM_MOCK },
    } as TransactionMeta);
  });

  it('updates payment token', () => {
    const updateTransactionDataMock = jest.fn();

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger: {} as never,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(buildTokenDataMock).toHaveBeenCalledWith({
      chainId: CHAIN_ID_MOCK,
      from: FROM_MOCK,
      messenger: {},
      tokenAddress: TOKEN_ADDRESS_MOCK,
    });

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken).toStrictEqual(PAYMENT_TOKEN_MOCK);
  });

  it('throws if token data not found', () => {
    buildTokenDataMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: {} as never,
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Payment token not found');
  });

  it('throws if transaction not found', () => {
    getTransactionMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
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
