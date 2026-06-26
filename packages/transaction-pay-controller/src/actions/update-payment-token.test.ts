import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash';

import type { TransactionData, TransactionPaymentToken } from '../types';
import {
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../utils/token';
import { getTransaction } from '../utils/transaction';
import { updatePaymentToken } from './update-payment-token';

jest.mock('../utils/token', () => ({
  ...jest.createMockFromModule<typeof import('../utils/token')>(
    '../utils/token',
  ),
  computeTokenAmounts:
    jest.requireActual<typeof import('../utils/token')>('../utils/token')
      .computeTokenAmounts,
}));
jest.mock('../utils/transaction');

const TOKEN_ADDRESS_MOCK = '0x123';
const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456';
const TRANSACTION_ID_MOCK = '123-456';

const ACCOUNT_OVERRIDE_MOCK = '0x789';

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

function createMessengerMock(
  transactionData: Record<string, unknown> = {},
): never {
  return {
    call: jest.fn().mockReturnValue({ transactionData }),
  } as never;
}

describe('Update Payment Token Action', () => {
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTransactionMock = jest.mocked(getTransaction);

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenInfoMock.mockReturnValue({
      decimals: PAYMENT_TOKEN_MOCK.decimals,
      symbol: PAYMENT_TOKEN_MOCK.symbol,
    });

    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '2',
      usdRate: '3',
    });

    getTokenBalanceMock.mockReturnValue('1230000');

    getTransactionMock.mockReturnValue({
      id: TRANSACTION_ID_MOCK,
      txParams: { from: FROM_MOCK },
    } as TransactionMeta);
  });

  it('updates payment token', () => {
    const updateTransactionDataMock = jest.fn();
    const messenger = createMessengerMock();

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getTokenBalanceMock).toHaveBeenCalledWith(
      messenger,
      FROM_MOCK,
      CHAIN_ID_MOCK,
      TOKEN_ADDRESS_MOCK,
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

    expect(transactionDataMock.fiatPayment).toStrictEqual({});
  });

  it('uses accountOverride for balance lookup when set', () => {
    const updateTransactionDataMock = jest.fn();
    const messenger = createMessengerMock({
      [TRANSACTION_ID_MOCK]: { accountOverride: ACCOUNT_OVERRIDE_MOCK },
    });

    updatePaymentToken(
      {
        chainId: CHAIN_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      },
      {
        messenger,
        updateTransactionData: updateTransactionDataMock,
      },
    );

    expect(getTokenBalanceMock).toHaveBeenCalledWith(
      messenger,
      ACCOUNT_OVERRIDE_MOCK,
      CHAIN_ID_MOCK,
      TOKEN_ADDRESS_MOCK,
    );
  });

  it('throws if token info not found', () => {
    getTokenInfoMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock(),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Payment token not found');
  });

  it('throws if fiat rate not found', () => {
    getTokenFiatRateMock.mockReturnValue(undefined);

    expect(() =>
      updatePaymentToken(
        {
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          transactionId: TRANSACTION_ID_MOCK,
        },
        {
          messenger: createMessengerMock(),
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
          messenger: createMessengerMock(),
          updateTransactionData: noop,
        },
      ),
    ).toThrow('Transaction not found');
  });
});
