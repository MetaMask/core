import type { BridgeStatusControllerMessenger, Operation } from '../types.js';
import { safeRejectTxBatch } from './approval.js';
import {
  mmPayQuotesReadySubscription,
  unapprovedTxSubscription,
} from './subscriptions.js';

/**
 * Shared timeout for the MM Pay quotes subscription, the unapproved-tx subscription, and
 * `addTransactionBatchFn`. The pending approval is rejected if any of the subscriptions time out.
 */
const ADD_BATCH_TX_TIMEOUT_MS = 120_000;

/**
 * @param ms - timeout duration in milliseconds
 * @param message - error message
 * @returns a promise that rejects after the timeout duration with the given error message and a function to clear the timeout
 */
const startTimeout = <Settled>(
  ms: number,
  message: string,
): { promise: Promise<Settled>; clear: () => void } => {
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];
  return {
    promise: new Promise<Settled>((_resolve, reject) => {
      timeoutIds.push(
        setTimeout((): void => {
          reject(new Error(message));
        }, ms),
      );
    }),
    clear: (): void => {
      clearTimeout(timeoutIds[0]);
    },
  };
};

/**
 * Subscribes to MM Pay quotes and waits for a matching unapproved tx and then runs `fn`.
 * fn doesn't settle if any of the subscriptions don't settle, so the pending approval
 * is rejected after 30s.
 *
 * @param params - money account operation options
 * @param fn - typically `addTransactionBatchFn`
 * @returns the result of `fn`
 * @throws error thrown by `fn`, or if timeout is reached
 */
export const withMmPayApproval = async <ResultType>(
  params: {
    messenger: BridgeStatusControllerMessenger;
    batchId: string;
    primaryMoneyAccount: { address: `0x${string}` };
    underlyingToken: `0x${string}`;
    chainId: `0x${string}`;
    operation: Operation;
  },
  fn: () => Promise<ResultType>,
): Promise<ResultType> => {
  const {
    messenger,
    batchId,
    primaryMoneyAccount,
    underlyingToken,
    chainId,
    operation,
  } = params;

  // Wait for MM Pay quotes to be ready
  const quotesReady = mmPayQuotesReadySubscription(messenger, batchId);
  // Wait for unapproved tx to be added
  const unapprovedTx = unapprovedTxSubscription(
    messenger,
    batchId,
    operation,
    primaryMoneyAccount,
    underlyingToken,
    chainId,
  );

  const timeout = startTimeout<ResultType>(
    ADD_BATCH_TX_TIMEOUT_MS,
    `Timed out waiting for ${operation} batch`,
  );

  try {
    const subscribeAndAddTx = Promise.all([
      quotesReady.promise,
      unapprovedTx.promise,
      fn(),
    ]).then(([, , result]) => result);
    // Handle errors that occur after timeout
    subscribeAndAddTx.catch(() => undefined);

    // Wait for either the timeout or for the subscriptions to settle
    return await Promise.race([timeout.promise, subscribeAndAddTx]);
  } catch (error) {
    safeRejectTxBatch(messenger, batchId, (error as Error).message);
    messenger.captureException?.(error as Error);
    throw error;
  } finally {
    quotesReady.unsubscribe();
    unapprovedTx.unsubscribe();
    timeout.clear();
  }
};
