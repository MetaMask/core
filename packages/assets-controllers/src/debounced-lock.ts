import debounce from 'lodash/debounce';

/**
 * Create a debounced async function that also enforces a simple in-flight lock.
 *
 * - Debounce: multiple calls in the same tick are coalesced into one call using the latest arguments.
 * - Lock: if a call is already in progress, subsequent calls return the in-flight promise.
 *
 * @param operation - The async operation to debounce and lock.
 * @returns Debounced + locked function.
 */
export function createDebouncedLockedAsyncFunction<
  TArgs extends unknown[],
  TResult,
>(
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let inFlightPromise: Promise<TResult> | undefined;
  let pendingPromise: Promise<TResult> | undefined;
  let pendingResolve:
    | ((value: TResult | PromiseLike<TResult>) => void)
    | undefined;
  let pendingReject: ((reason?: unknown) => void) | undefined;
  let isFlushQueued = false;

  const runOperation = (args: TArgs): void => {
    if (!pendingResolve || !pendingReject) {
      return;
    }

    const resolve = pendingResolve;
    const reject = pendingReject;

    pendingPromise = undefined;
    pendingResolve = undefined;
    pendingReject = undefined;

    inFlightPromise = Promise.resolve().then(() => operation(...args));
    inFlightPromise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        inFlightPromise = undefined;
      })
      .catch(() => undefined);
  };

  const debouncedRunOperation = debounce(runOperation, 0);

  const scheduleFlush = (): void => {
    if (isFlushQueued) {
      return;
    }

    isFlushQueued = true;
    Promise.resolve()
      .then(() => {
        isFlushQueued = false;
        debouncedRunOperation.flush();
        return undefined;
      })
      .catch(() => undefined);
  };

  return (...args: TArgs): Promise<TResult> => {
    if (inFlightPromise) {
      return inFlightPromise;
    }

    pendingPromise ??= new Promise<TResult>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    debouncedRunOperation(args);
    scheduleFlush();
    return pendingPromise;
  };
}
