/* eslint-disable no-new */

import { createDeferredPromise } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flushPromises } from '../../../../tests/vitest/helpers.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import { TransactionPayStrategy } from '../constants.js';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
} from '../types.js';
import { refreshQuotes } from '../utils/quotes.js';
import { QuoteRefresher } from './QuoteRefresher.js';

vi.mock(import('../utils/quotes.js'));

vi.useFakeTimers();

describe('QuoteRefresher', () => {
  const refreshQuotesMock = vi.mocked(refreshQuotes);
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
    vi.resetAllMocks();
    vi.clearAllTimers();

    ({ messenger, publish } = getMessengerMock());

    refreshQuotesMock.mockResolvedValue(undefined);
  });

  it('polls if quotes detected in state', async () => {
    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: vi.fn(),
    });

    publishStateChange({ hasQuotes: true });

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not poll if no quotes in state', async () => {
    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: vi.fn(),
    });

    publishStateChange({ hasQuotes: false });

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).not.toHaveBeenCalled();
  });

  it('does not poll if only no-op quotes in state', async () => {
    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: vi.fn(),
    });

    publish(
      'TransactionPayController:stateChange',
      {
        transactionData: {
          '123': {
            quotes: [{ strategy: TransactionPayStrategy.None }],
          } as TransactionData,
        },
      },
      [],
    );

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).not.toHaveBeenCalled();
  });

  it('polls again after interval', async () => {
    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: vi.fn(),
    });

    publishStateChange({ hasQuotes: true });

    vi.runAllTimers();
    await flushPromises();

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('stops polling if quotes removed', async () => {
    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData: vi.fn(),
    });

    publishStateChange({ hasQuotes: true });
    publishStateChange({ hasQuotes: false });

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(0);
  });

  it('does not throw if refresh fails', async () => {
    const updateTransactionData = vi.fn();

    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    refreshQuotesMock.mockRejectedValueOnce(new Error('Test error'));

    vi.runAllTimers();
    await flushPromises();

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(2);
  });

  it('does not update multiple times concurrently', async () => {
    const updateTransactionData = vi.fn();

    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    vi.runAllTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });
    publishStateChange({ hasQuotes: true });

    vi.runAllTimers();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue if stopped while polling', async () => {
    const updateTransactionData = vi.fn();

    new QuoteRefresher({
      getStrategies: vi.fn().mockReturnValue([TransactionPayStrategy.Relay]),
      messenger,
      updateTransactionData,
    });

    publishStateChange({ hasQuotes: true });

    const promise = createDeferredPromise();
    refreshQuotesMock.mockReturnValue(promise.promise);

    vi.runAllTimers();
    await flushPromises();

    publishStateChange({ hasQuotes: false });

    promise.resolve();
    await flushPromises();

    expect(refreshQuotesMock).toHaveBeenCalledTimes(1);
  });
});
