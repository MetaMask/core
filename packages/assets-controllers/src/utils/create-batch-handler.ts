import { debounce } from 'lodash';

/**
 * Batched handler: buffers arguments, debounces flush, then runs an aggregator
 * on the buffer and invokes onFlush with the result. Used to coalesce rapid
 * updateBalances calls without dropping params.
 *
 * @param aggregatorFn - Reduces the buffered items into one.
 * @param timeframeMs - Debounce wait before flushing.
 * @param onFlush - Called with the aggregated result when flush runs.
 * @returns Object with capture (push item and schedule flush) and cancel.
 */
export function createBatchedHandler<Item>(
  aggregatorFn: (buffer: Item[]) => Item,
  timeframeMs: number,
  onFlush: (merged: Item) => void | Promise<void>,
): (arg: Item) => void {
  let eventBuffer: Item[] = [];
  const flush = async (): Promise<void> => {
    if (eventBuffer.length === 0) {
      return;
    }
    const merged = aggregatorFn(eventBuffer);
    eventBuffer = [];
    await onFlush(merged);
  };
  const debouncedFlush = debounce(flush, timeframeMs, {
    leading: false,
    trailing: true,
  });
  const capture = (arg: Item): void => {
    eventBuffer.push(arg);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    debouncedFlush();
  };

  return capture;
}
