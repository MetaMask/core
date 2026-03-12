import type { DebouncedFuncLeading } from 'lodash';
import { debounce } from 'lodash';

const DEFAULT_WAIT_MS = 500;

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
  asyncFn: (...args: TArgs) => Promise<TReturn>,
  wait = DEFAULT_WAIT_MS,
): DebouncedFuncLeading<typeof asyncFn> {
  let inflightPromise: Promise<TReturn> | null = null;
  let debouncedFn: DebouncedFuncLeading<typeof asyncFn> | null = null;

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
  });

  return debouncedFn;
}
