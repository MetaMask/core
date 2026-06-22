import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { Json } from '@metamask/utils';

/**
 * Creates a ready-to-use StaticIntervalPollingControllerOnly instance whose
 * _executePoll delegates to the provided callback.
 *
 * This is useful for classes that already extend another base (e.g.
 * AbstractDataSource) and cannot directly extend
 * StaticIntervalPollingControllerOnly via inheritance. The returned object
 * exposes the full polling API: startPolling, stopPollingByPollingToken,
 * stopAllPolling, setIntervalLength, etc.
 *
 * @param fn - Async callback invoked on every poll tick.
 * @returns A StaticIntervalPollingControllerOnly instance.
 */
export function makePoller<T extends Json>(
  fn: (input: T) => Promise<void>,
): InstanceType<ReturnType<typeof StaticIntervalPollingControllerOnly<T>>> {
  const Base = StaticIntervalPollingControllerOnly<T>();
  // eslint-disable-next-line @typescript-eslint/no-shadow
  return new (class extends Base {
    async _executePoll(input: T): Promise<void> {
      await fn(input);
    }
  })() as InstanceType<ReturnType<typeof StaticIntervalPollingControllerOnly<T>>>;
}
