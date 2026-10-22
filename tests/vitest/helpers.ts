import {
  setImmediate as realSetImmediate,
  setTimeout as realSetTimeout,
} from 'node:timers';
import { vi } from 'vitest';

/**
 * Advances the provided fake timer by a specified duration in incremental steps.
 * Between each step, any enqueued promises are processed. However, any setTimeouts created
 * by those promises will not have their timers advanced until the next incremental step.
 *
 * Fake timers in testing libraries allow simulation of time without actually waiting. However,
 * they don't always account for promises or other asynchronous operations that may get enqueued
 * during the timer's duration. By advancing time in incremental steps and flushing promises
 * between each step, this function ensures that both timers and promises are comprehensively processed.
 *
 * @param options - The options object.
 * @param options.duration - The total amount of time (in milliseconds) to advance the timer by.
 * @param options.stepSize - The incremental step size (in milliseconds) by which the timer is advanced in each iteration. Default is 1/4 of the duration.
 */
export async function advanceTime({
  duration,
  stepSize = duration / 4,
}: {
  duration: number;
  stepSize?: number;
}): Promise<void> {
  let value = duration;
  do {
    await vi.advanceTimersByTimeAsync(stepSize);
    value -= stepSize;
  } while (value > 0);
}

/**
 * Keeps advancing the fake timers until the given promise settles, yielding a
 * real macrotask after each step. A fixed advance can finish before a reply on
 * the real event loop (nock, for example) lands on a slow runner, which leaves
 * the promise waiting on a timer that nothing advances any more.
 *
 * @param promise - The promise to wait for.
 * @param options - The options object.
 * @param options.stepSize - How far to advance the timers on each step, in
 * milliseconds. Defaults to 1.
 * @returns The value the promise resolves to.
 */
export async function advanceTimeUntilSettled<Value>(
  promise: Promise<Value>,
  { stepSize = 1 }: { stepSize?: number } = {},
): Promise<Value> {
  const status = { settled: false };
  promise
    .finally(() => {
      status.settled = true;
    })
    .catch(() => undefined);

  while (!status.settled) {
    await vi.advanceTimersByTimeAsync(stepSize);
    await new Promise((resolve) => realSetTimeout(resolve, 0));
  }

  return await promise;
}

/**
 * Resolve all pending promises.
 *
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 *
 * `setImmediate` comes from `node:timers` so that it is the real one even while
 * fake timers are installed.
 *
 * TODO: migrate this to @metamask/utils
 *
 * @returns A promise that resolves once the microtask queue has drained.
 */
export async function flushPromises(): Promise<void> {
  await new Promise(realSetImmediate);
}
