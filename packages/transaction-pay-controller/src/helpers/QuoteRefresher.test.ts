/* eslint-disable no-new */

import { createDeferredPromise } from '@metamask/utils';

import { QuoteRefresher } from './QuoteRefresher';
import { flushPromises } from '../../../../tests/helpers';
import { TransactionPayStrategy } from '../constants';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
} from '../types';
import { refreshQuotes } from '../utils/quotes';

jest.mock('../utils/quotes');

jest.useFakeTimers();

describe('QuoteRefresher', () => {
  const refreshQuotesMock = jest.mocked(refreshQuotes);
  let messenger: TransactionPayControllerMessenger;
  let publish: ReturnType<typeof getMessengerMock>['publish'];

  /**
   * Helper to publish state changes with or without quotes.
   *
   * @param options - Options object.
   * @param options.hasQuotes - Whether to include quotes in the state.
   */
  function publishStateChange({ hasQuotes }: { hasQuotes: boolean }): void {
    const transactionData = {
      '123': (hasQuotes ? { quotes: [{}] } : {}) as TransactionData,
    };

    publish(
      'TransactionPayController:stateChange',
      {
        transactionData,
      },
      [],
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();

    ({ messenger, publish } = getMessengerMock());

    refreshQuotesMock.mockResolvedValue(undefined);
  });

  it('polls if quotes detected in state', async () => {
    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll if no quotes in state', async () => {
    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: false });

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).not.toHaveBeenCalled();
  });

  it('polls again after interval', async () => {
    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });

    jest.runAllTimers();
    await flushPromises();

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling if quotes removed', async () => {
    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });
    publishStateChange({ hasQuotes: false });

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(0);
  });

  it('does not throw if refresh fails', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    refreshQuotesMock.mockRejectedValueOnce(new Error('Test error'));

    jest.runAllTimers();
    await flushPromises();

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('does not update multiple times concurrently', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    jest.runAllTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });
    publishStateChange({ hasQuotes: true });

    jest.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue if stopped while polling', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      getStrategies: jest.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    jest.runAllTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });

    promise.resolve();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });
});
