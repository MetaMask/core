import type { DebouncedFunc } from 'lodash';
import { debounce } from 'lodash';

type AsyncFunction<TArgs extends unknown[], TReturn> = (
  ...args: TArgs
) => Promise<TReturn>;

type DebounceAndLockResult<TArgs extends unknown[], TReturn> = DebouncedFunc<
  (...args: TArgs) => Promise<TReturn | undefined>
> & {
  isLocked: () => boolean;
};

/**
 * Create a debounced async function that also enforces a simple in-flight lock.
 *
 * - Debounce: multiple calls in the same tick are coalesced into one call using the latest arguments.
 * - Lock: if a call is already in progress, subsequent calls return the in-flight promise.
 *
 * @param asyncFn - The async operation to debounce and lock.
 * @param wait - Debounce delay in milliseconds (default: 0).
 * @returns Debounced + locked function.
 */
export function debounceAndLock<TArgs extends unknown[], TReturn>(
  asyncFn: AsyncFunction<TArgs, TReturn>,
  wait = 0,
): DebounceAndLockResult<TArgs, TReturn> {
  let inflightPromise: Promise<TReturn> | null = null;
  let scheduledPromise: Promise<TReturn | undefined> | null = null;

  const lockedFn = async (...args: TArgs): Promise<TReturn> => {
    if (inflightPromise) {
      return inflightPromise;
    }

    const currentPromise = asyncFn(...args);
    inflightPromise = currentPromise;

    try {
      return await currentPromise;
    } finally {
      if (inflightPromise === currentPromise) {
        inflightPromise = null;
      }
    }
  };

  const debouncedFn = debounce(lockedFn, wait) as DebounceAndLockResult<
    TArgs,
    TReturn
  >;
  debouncedFn.isLocked = (): boolean => inflightPromise !== null;

  const wrappedFn = ((...args: TArgs): Promise<TReturn | undefined> => {
    if (inflightPromise) {
      return inflightPromise;
    }

    const maybePromise = debouncedFn(...args);

    if (wait !== 0) {
      return Promise.resolve(maybePromise);
    }

    scheduledPromise ??= Promise.resolve()
      .then(() => debouncedFn.flush())
      .finally(() => {
        scheduledPromise = null;
      });

    return scheduledPromise;
  }) as DebounceAndLockResult<TArgs, TReturn>;

  wrappedFn.cancel = debouncedFn.cancel.bind(debouncedFn);
  wrappedFn.flush = debouncedFn.flush.bind(debouncedFn);
  wrappedFn.isLocked = debouncedFn.isLocked;

  return wrappedFn;
}

export default debounceAndLock;
