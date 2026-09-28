import { expect, vi } from 'vitest';

import { advanceTimeWith } from '../shared-helpers.js';

/**
 * Test helpers for packages whose tests run under Vitest.
 *
 * This is the Vitest counterpart to `tests/helpers.ts`; the runner-agnostic
 * helpers both share live in `tests/shared-helpers.ts`. Once every package has
 * moved to Vitest, the three modules can be merged back into a single
 * `tests/helpers.ts`.
 */

export { buildTestObject, flushPromises } from '../shared-helpers.js';

/**
 * Advances the provided fake timer by a specified duration in incremental steps,
 * flushing promises between each step.
 *
 * TODO: Rename this to `advanceTime` once no package uses the Jest helpers.
 *
 * @param options - The options object.
 * @param options.duration - The total amount of time (in milliseconds) to advance the timer by.
 * @param options.stepSize - The incremental step size (in milliseconds) by which the timer is advanced in each iteration. Default is 1/4 of the duration.
 */
export async function jestAdvanceTime(options: {
  duration: number;
  stepSize?: number;
}): Promise<void> {
  await advanceTimeWith(
    async (ms) => await vi.advanceTimersByTimeAsync(ms),
    options,
  );
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
