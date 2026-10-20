import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  TransactionControllerGetStateAction,
  TransactionControllerState,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { TransactionPayStrategy } from '../constants.js';
import { getMessengerMock } from '../tests/messenger-mock.js';
import type {
  TransactionData,
  TransactionPaymentToken,
  TransactionPayControllerGetStateAction,
  TransactionPayControllerMessenger,
  TransactionPaySourceAmount,
  UpdateTransactionDataCallback,
} from '../types.js';
import { updateQuotes } from '../utils/quotes.js';
import { updateSourceAmounts } from '../utils/source-amounts.js';
import { MaxBalanceRefresher } from './MaxBalanceRefresher.js';

jest.useFakeTimers();

jest.mock('../utils/quotes');
jest.mock('../utils/source-amounts');

describe('MaxBalanceRefresher', () => {
  const transactionId = '123';

  const getBalance = jest.fn().mockReturnValue({ balanceRaw: '9900000' });
  const getStrategies = jest
    .fn()
    .mockReturnValue([TransactionPayStrategy.Relay]);

  let messenger: TransactionPayControllerMessenger;
  let getControllerStateMock: jest.MockedFn<
    TransactionPayControllerGetStateAction['handler']
  >;
  let getRemoteFeatureFlagControllerStateMock: jest.MockedFn<
    RemoteFeatureFlagControllerGetStateAction['handler']
  >;
  let getTransactionControllerStateMock: jest.MockedFn<
    TransactionControllerGetStateAction['handler']
  >;
  let transactionPayState: { transactionData: Record<string, TransactionData> };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    const mocks = getMessengerMock() as {
      getControllerStateMock: typeof getControllerStateMock;
      getRemoteFeatureFlagControllerStateMock: typeof getRemoteFeatureFlagControllerStateMock;
      getTransactionControllerStateMock: typeof getTransactionControllerStateMock;
      messenger: TransactionPayControllerMessenger;
    };

    ({
      getControllerStateMock,
      getRemoteFeatureFlagControllerStateMock,
      getTransactionControllerStateMock,
      messenger,
    } = mocks);

    getTransactionControllerStateMock.mockReturnValue({
      batchTransactionCounts: {},
      lastFetchedBlockNumbers: {},
      methodData: {},
      submitHistory: [],
      transactionBatches: [],
      transactions: [
        {
          id: transactionId,
          type: TransactionType.perpsWithdraw,
        } as TransactionMeta,
      ],
    } satisfies TransactionControllerState);
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
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
            balanceFiat: '0',
            balanceHuman: '0',
            balanceRaw: '0',
            balanceUsd: '0',
            chainId: '0x1',
            decimals: 6,
            symbol: 'USDC',
          } satisfies TransactionPaymentToken,
          sourceAmounts: [],
          tokens: [],
        } satisfies TransactionData,
      },
    };

    getControllerStateMock.mockImplementation(() => transactionPayState);

    jest.mocked(updateQuotes).mockResolvedValue(true);
  });

  it('passes refreshed source amounts to updateQuotes', () => {
    const updateTransactionData: UpdateTransactionDataCallback = jest.fn(
      (id, callback) => {
        callback(transactionPayState.transactionData[id]);
      },
    );

    jest.mocked(updateSourceAmounts).mockImplementation((_, data) => {
      if (!data) {
        return;
      }

      data.sourceAmounts = [
        {
          sourceAmountHuman: '9.9',
          sourceAmountRaw: '9900000',
          targetTokenAddress: '0xabc',
        } satisfies TransactionPaySourceAmount,
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

    const sourceAmountCall = jest.mocked(updateSourceAmounts).mock.calls[0];
    expect(sourceAmountCall).toStrictEqual([
      transactionId,
      transactionPayState.transactionData[transactionId],
      messenger,
      getBalance,
    ]);

    const quoteRequest = jest.mocked(updateQuotes).mock.calls[0][0];
    expect(quoteRequest.getStrategies).toBe(getStrategies);
    expect(quoteRequest.messenger).toBe(messenger);
    expect(quoteRequest.transactionData).toBe(
      transactionPayState.transactionData[transactionId],
    );
    expect(quoteRequest.transactionData?.sourceAmounts).toStrictEqual([
      {
        sourceAmountHuman: '9.9',
        sourceAmountRaw: '9900000',
        targetTokenAddress: '0xabc',
      },
    ]);
    expect(quoteRequest.transactionId).toBe(transactionId);
    expect(quoteRequest.updateTransactionData).toBe(updateTransactionData);
  });

  it('does not start when no interval matches the transaction type', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          maxBalanceRefreshInterval: {},
        },
      },
    });

    const updateTransactionData = jest.fn(
      (_id: string, _callback: Parameters<UpdateTransactionDataCallback>[1]) =>
        undefined,
    );
    const refresher = new MaxBalanceRefresher({
      getBalance,
      getStrategies,
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
      getBalance,
      getStrategies,
      messenger,
      updateTransactionData: jest.fn(
        (
          _id: string,
          _callback: Parameters<UpdateTransactionDataCallback>[1],
        ) => undefined,
      ),
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
      getBalance,
      getStrategies,
      messenger,
      updateTransactionData: jest.fn(
        (
          _id: string,
          _callback: Parameters<UpdateTransactionDataCallback>[1],
        ) => undefined,
      ),
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
      getBalance,
      getStrategies,
      messenger,
      updateTransactionData: jest.fn(
        (
          _id: string,
          _callback: Parameters<UpdateTransactionDataCallback>[1],
        ) => undefined,
      ),
    });

    refresher.start(transactionId);
    refresher.stop(transactionId);
    jest.advanceTimersByTime(5000);

    expect(updateSourceAmounts).not.toHaveBeenCalled();
    expect(updateQuotes).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
