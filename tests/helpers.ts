import { expect, jest } from '@jest/globals';
import { setImmediate as realSetImmediate } from 'node:timers';

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
export async function jestAdvanceTime({
  duration,
  stepSize = duration / 4,
}: {
  duration: number;
  stepSize?: number;
}): Promise<void> {
  let value = duration;
  do {
    await jest.advanceTimersByTimeAsync(stepSize);
    value -= stepSize;
  } while (value > 0);
}

/**
 * Resolve all pending promises.
 *
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 *
 * `setImmediate` comes from `node:timers` so that it is the real one even
 * while fake timers are installed.
 *
 * TODO: migrate this to @metamask/utils
 */
export async function flushPromises(): Promise<void> {
  await new Promise(realSetImmediate);
}

/**
 * Some tests involve a rejected promise that is not necessarily the focus of
 * the test. In these cases we don't want to ignore the error in case the
 * promise _isn't_ rejected, but we don't want to highlight the assertion,
 * either.
 *
 * @param promiseOrFn - A promise that rejects, or a function that returns a
 * promise that rejects.
 */
export async function ignoreRejection<Type>(
  promiseOrFn: Promise<Type> | (() => Type | Promise<Type>),
): Promise<void> {
  await expect(promiseOrFn).rejects.toThrow(expect.any(Error));
}
