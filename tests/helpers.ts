import { expect, jest } from '@jest/globals';

import { advanceTimeWith } from './shared-helpers.js';

/**
 * Test helpers for packages whose tests still run under Jest.
 *
 * The runner-agnostic helpers live in `tests/shared-helpers.ts` and are
 * re-exported here so that this module's public surface is unchanged. The Vitest
 * equivalent of this module is `tests/vitest/helpers.ts`.
 *
 * `jest` and `expect` are imported from `@jest/globals` rather than read off the
 * ambient global, because a package that has migrated to Vitest can still reach
 * this module transitively - `sample-controllers` imports a test helper from
 * `network-controller`, which imports this one - and such a package's tsconfig no
 * longer declares Jest's types.
 */

export { buildTestObject, flushPromises } from './shared-helpers.js';

/**
 * Advances the provided fake timer by a specified duration in incremental steps,
 * flushing promises between each step.
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
    async (ms) => await jest.advanceTimersByTimeAsync(ms),
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
