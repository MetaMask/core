import {
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '../constants.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPaySourceAmount,
} from '../types.js';
import { updateQuotes } from '../utils/quotes.js';
import { updateSourceAmounts } from '../utils/source-amounts.js';
import { MaxBalanceRefresher } from './MaxBalanceRefresher.js';

jest.useFakeTimers();

jest.mock('../utils/quotes');
jest.mock('../utils/source-amounts');

describe('MaxBalanceRefresher', () => {
  const transactionId = '123';

  let messenger: TransactionPayControllerMessenger;
  let getControllerStateMock: jest.Mock;
  let getRemoteFeatureFlagControllerStateMock: jest.Mock;
  let getTransactionControllerStateMock: jest.Mock;
  let transactionPayState: { transactionData: Record<string, TransactionData> };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    ({
      getControllerStateMock,
      getRemoteFeatureFlagControllerStateMock,
      getTransactionControllerStateMock,
      messenger,
    } = getMessengerMock());

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

    transactionPayState = {
      transactionData: {
        [transactionId]: {
          fiatPayment: {},
          isLoading: false,
          isMaxAmount: true,
          paymentToken: {
            address: '0xabc',
            balanceRaw: '0',
            chainId: '0x1',
          } as never,
          sourceAmounts: [],
          tokens: [],
        } as TransactionData,
      },
    };

    getControllerStateMock.mockImplementation(() => transactionPayState);

    jest.mocked(updateQuotes).mockResolvedValue(true);
  });

  it('passes refreshed source amounts to updateQuotes', () => {
    const getBalance = jest.fn().mockReturnValue({ balanceRaw: '9900000' });
    const getStrategies = jest.fn().mockReturnValue([TransactionPayStrategy.Relay]);
    const updateTransactionData = jest.fn((id: string, callback) => {
      callback(transactionPayState.transactionData[id]);
    });

    jest.mocked(updateSourceAmounts).mockImplementation((_, data) => {
      data!.sourceAmounts = [
        {
          sourceAmountRaw: '9900000',
        } as TransactionPaySourceAmount,
      ];
    });

    const refresher = new MaxBalanceRefresher({
      getBalance,
      getStrategies,
      messenger,
      updateTransactionData,
    });

    refresher.start(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmounts).toHaveBeenCalledWith(
      transactionId,
      expect.objectContaining({
        isMaxAmount: true,
        paymentToken: expect.any(Object),
      }),
      messenger,
      getBalance,
    );
    expect(updateQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        getStrategies,
        messenger,
        transactionData: expect.objectContaining({
          sourceAmounts: [expect.objectContaining({ sourceAmountRaw: '9900000' })],
        }),
        transactionId,
        updateTransactionData,
      }),
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

    const updateTransactionData = jest.fn();
    const refresher = new MaxBalanceRefresher({
      getBalance: jest.fn(),
      getStrategies: jest.fn(),
      messenger,
      updateTransactionData,
    });

    refresher.start(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateTransactionData).not.toHaveBeenCalled();
    expect(updateQuotes).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not restart an already running timer for the same transaction', () => {
    const refresher = new MaxBalanceRefresher({
      getBalance: jest.fn(),
      getStrategies: jest.fn(),
      messenger,
      updateTransactionData: jest.fn(),
    });

    refresher.start(transactionId);
    jest.advanceTimersByTime(4000);
    refresher.start(transactionId);
    jest.advanceTimersByTime(1000);

    expect(jest.getTimerCount()).toBe(1);
  });

  it('stops refreshing when the transaction is no longer max', () => {
    transactionPayState.transactionData[transactionId].isMaxAmount = false;

    const refresher = new MaxBalanceRefresher({
      getBalance: jest.fn(),
      getStrategies: jest.fn(),
      messenger,
      updateTransactionData: jest.fn(),
    });

    const stopSpy = jest.spyOn(refresher, 'stop');

    refresher.start(transactionId);
    jest.advanceTimersByTime(5000);

    expect(stopSpy).toHaveBeenCalledWith(transactionId);
    expect(updateSourceAmounts).not.toHaveBeenCalled();
    expect(updateQuotes).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops refreshing when requested', () => {
    const refresher = new MaxBalanceRefresher({
      getBalance: jest.fn(),
      getStrategies: jest.fn(),
      messenger,
      updateTransactionData: jest.fn(),
    });

    refresher.start(transactionId);
    refresher.stop(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmounts).not.toHaveBeenCalled();
    expect(updateQuotes).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
