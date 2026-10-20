import {
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';

import { getMessengerMock } from '../tests/messenger-mock.js';
import type {
  GetBalanceCallback,
  TransactionData,
  TransactionPayControllerMessenger,
} from '../types.js';
import { updateSourceAmounts } from '../utils/source-amounts.js';
import { MaxBalanceRefresher } from './MaxBalanceRefresher.js';

jest.mock('../utils/source-amounts');

jest.useFakeTimers();

describe('MaxBalanceRefresher', () => {
  const transactionId = '123';
  const getBalance: GetBalanceCallback = jest.fn();
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);

  let messenger: TransactionPayControllerMessenger;
  let getControllerStateMock: jest.Mock;
  let getRemoteFeatureFlagControllerStateMock: jest.Mock;
  let getTransactionControllerStateMock: jest.Mock;
  let transactionData: TransactionData;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    ({
      getControllerStateMock,
      getRemoteFeatureFlagControllerStateMock,
      getTransactionControllerStateMock,
      messenger,
    } = getMessengerMock());

    transactionData = {
      fiatPayment: {},
      isLoading: false,
      isMaxAmount: true,
      tokens: [],
    };

    getControllerStateMock.mockReturnValue({
      transactionData: { [transactionId]: transactionData },
    });
    getTransactionControllerStateMock.mockReturnValue({
      transactions: [
        {
          id: transactionId,
          type: TransactionType.perpsWithdraw,
        } as TransactionMeta,
      ],
    });
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          maxBalanceRefreshInterval: {
            [TransactionType.perpsWithdraw]: 5000,
          },
        },
      },
    });
  });

  it('refreshes source amounts at the configured interval', () => {
    const refresher = new MaxBalanceRefresher({ getBalance, messenger });

    refresher.start(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmountsMock).toHaveBeenCalledWith(
      transactionId,
      transactionData,
      messenger,
      getBalance,
    );
  });

  it('does not start when no interval matches the transaction type', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          maxBalanceRefreshInterval: {},
        },
      },
    });

    const refresher = new MaxBalanceRefresher({ getBalance, messenger });

    refresher.start(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmountsMock).not.toHaveBeenCalled();
  });

  it('stops refreshing when the transaction is no longer max', () => {
    const refresher = new MaxBalanceRefresher({ getBalance, messenger });

    refresher.start(transactionId);
    transactionData.isMaxAmount = false;
    jest.advanceTimersByTime(5000);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmountsMock).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
