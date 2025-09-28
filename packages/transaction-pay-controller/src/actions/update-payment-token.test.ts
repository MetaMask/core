import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash';

import { updatePaymentToken } from './update-payment-token';
import type { TransactionData } from '../types';
import {
  getTokenBalance,
  getTokenInfo,
  getTokenFiatRate,
} from '../utils/token';
import { getTransaction } from '../utils/transaction';

jest.mock('../utils/token');
jest.mock('../utils/transaction');

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';
const TRANSACTION_ID_MOCK = '123-456';

describe('Update Payment Token Action', () => {
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTransactionMock = jest.mocked(getTransaction);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'TST' });
    getTokenBalanceMock.mockReturnValue('1230000');
    getTokenFiatRateMock.mockReturnValue({ fiatRate: '2.0', usdRate: '3.0' });

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

    expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

    const transactionDataMock = {} as TransactionData;
    updateTransactionDataMock.mock.calls[0][1](transactionDataMock);

    expect(transactionDataMock.paymentToken).toStrictEqual({
      address: TOKEN_ADDRESS_MOCK,
      balanceFiat: '2.46',
      balanceHuman: '1.23',
      balanceRaw: '1230000',
      balanceUsd: '3.69',
      chainId: CHAIN_ID_MOCK,
      decimals: 6,
      symbol: 'TST',
    });
  });

  it('throws if decimals not found', () => {
    getTokenInfoMock.mockReturnValue(undefined);

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

  it('throws if token fiat rate not found', () => {
    getTokenFiatRateMock.mockReturnValue(undefined);

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
