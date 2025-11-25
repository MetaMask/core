import { createDeferredPromise } from '@metamask/utils';

import { QuoteRefresher } from './QuoteRefresher';
import { flushPromises } from '../../../../tests/helpers';
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
  function publishStateChange({ hasQuotes }: { hasQuotes: boolean }) {
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
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });
    // Flush promises to ensure state change is processed and setTimeout is set up
    await flushPromises();

    // With Jest 28, we need to advance timers by the actual interval (1000ms)
    // to trigger the setTimeout callback
    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll if no quotes in state', async () => {
    new QuoteRefresher({
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
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });
    // Flush promises to ensure state change is processed and setTimeout is set up
    await flushPromises();

    // First poll
    jest.runOnlyPendingTimers();
    await flushPromises();

    // Second poll
    jest.runOnlyPendingTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling if quotes removed', async () => {
    new QuoteRefresher({
      messenger,
      updateTransactionData: jest.fn(),
    });

    publishStateChange({ hasQuotes: true });
    publishStateChange({ hasQuotes: false });
    // Flush promises to ensure state changes are processed
    await flushPromises();

    // Run timer - should not poll since quotes were removed
    jest.runOnlyPendingTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(0);
  });

  it('does not throw if refresh fails', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });
    // Flush promises to ensure state change is processed and setTimeout is set up
    await flushPromises();

    refreshQuotesMock.mockRejectedValueOnce(new Error('Test error'));

    // First poll (will fail)
    jest.runOnlyPendingTimers();
    await flushPromises();

    // Second poll (should continue despite error)
    jest.runOnlyPendingTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('does not update multiple times concurrently', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });
    // Flush promises to ensure state change is processed and setTimeout is set up
    await flushPromises();

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    // Start first poll (will be pending)
    jest.runOnlyPendingTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });
    publishStateChange({ hasQuotes: true });
    await flushPromises();

    // Run timer - should not start new poll while first is still pending
    jest.runOnlyPendingTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue if stopped while polling', async () => {
    const updateTransactionData = jest.fn();

    new QuoteRefresher({
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });
    // Flush promises to ensure state change is processed and setTimeout is set up
    await flushPromises();

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    // Start poll (will be pending)
    jest.runOnlyPendingTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });
    await flushPromises();

    promise.resolve();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });
});
