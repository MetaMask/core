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
  wait: number,
): DebounceAndLockResult<TArgs, TReturn> {
  if (wait <= 0) {
    throw new Error('debounceAndLock wait must be greater than zero');
  }

  let inflightPromise: Promise<TReturn> | null = null;
  let debouncedFn: DebounceAndLockResult<TArgs, TReturn> | null = null;

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

      // Reset debounce window immediately after each completed run.
      debouncedFn?.cancel();
    }
  };

  debouncedFn = debounce(lockedFn, wait, {
    leading: true,
    trailing: false,
  }) as DebounceAndLockResult<TArgs, TReturn>;
  debouncedFn.isLocked = (): boolean => inflightPromise !== null;
  return debouncedFn;
}

export default debounceAndLock;
