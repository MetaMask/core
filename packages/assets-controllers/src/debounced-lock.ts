import type { DebouncedFunc } from 'lodash';
import debounce from 'lodash/debounce';
import noop from 'lodash/noop';

type Deferred<TResult> = {
  promise: Promise<TResult>;
  resolve: (value: TResult | PromiseLike<TResult>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <TResult>(): Deferred<TResult> => {
  let resolve!: Deferred<TResult>['resolve'];
  let reject!: Deferred<TResult>['reject'];

  const promise = new Promise<TResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

/**
 * Create a debounced async function that also enforces a simple in-flight lock.
 *
 * - Debounce: multiple calls in the same tick are coalesced into one call using the latest arguments.
 * - Lock: if a call is already in progress, subsequent calls return the in-flight promise.
 *
 * @param operation - The async operation to debounce and lock.
 * @param wait - Debounce delay in milliseconds (default: 0).
 * @returns Debounced + locked function.
 */
export function createDebouncedLockedAsyncFunction<
  TArgs extends unknown[],
  TResult,
>(
  operation: (...args: TArgs) => Promise<TResult>,
  wait = 0,
): (...args: TArgs) => Promise<TResult> {
  let inFlightPromise: Promise<TResult> | null = null;
  let pendingCall: { args: TArgs; deferred: Deferred<TResult> } | null = null;
  let isFlushQueued = false;

  const runLockedOperation = async (...args: TArgs): Promise<TResult> => {
    if (inFlightPromise) {
      return inFlightPromise;
    }

    const currentPromise = operation(...args);
    inFlightPromise = currentPromise;

    try {
      return await currentPromise;
    } finally {
      if (inFlightPromise === currentPromise) {
        inFlightPromise = null;
      }
    }
  };

  const executePendingCall = (): void => {
    if (!pendingCall) {
      return;
    }

    const { args, deferred } = pendingCall;
    pendingCall = null;

    runLockedOperation(...args)
      .then((result) => {
        deferred.resolve(result);
        return undefined;
      })
      .catch((error: unknown) => {
        deferred.reject(error);
        return undefined;
      });
  };

  const debouncedExecutePendingCall: DebouncedFunc<() => void> = debounce(
    executePendingCall,
    wait,
  );

  const scheduleFlush = (): void => {
    if (isFlushQueued) {
      return;
    }

    isFlushQueued = true;
    Promise.resolve()
      .then(() => {
        isFlushQueued = false;
        debouncedExecutePendingCall.flush();
        return undefined;
      })
      .catch(noop);
  };

  return (...args: TArgs): Promise<TResult> => {
    if (inFlightPromise) {
      return inFlightPromise;
    }

    if (pendingCall) {
      pendingCall.args = args;
    } else {
      pendingCall = {
        args,
        deferred: createDeferred<TResult>(),
      };
    }

    debouncedExecutePendingCall();

    // For wait=0, flush in a microtask to avoid fake-timer deadlocks in tests.
    if (wait === 0) {
      scheduleFlush();
    }

    return pendingCall.deferred.promise;
  };
}
