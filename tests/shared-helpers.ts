import { getKnownPropertyNames } from '@metamask/utils';
import { setImmediate as realSetImmediate } from 'node:timers';

/**
 * Test helpers that do not touch a test runner's API, and so can be used from
 * packages running under Jest as well as packages running under Vitest.
 *
 * The runner-specific helpers live in `tests/helpers.ts` (Jest) and
 * `tests/vitest/helpers.ts` (Vitest), both of which re-export everything here.
 * Once every package has moved to Vitest, this module can be merged back into a
 * single `tests/helpers.ts`.
 */

/**
 * Resolve all pending promises.
 *
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 *
 * `setImmediate` is imported from `node:timers` rather than read off the global
 * object so that it is the real one even while fake timers are installed.
 *
 * TODO: migrate this to @metamask/utils
 *
 * @returns A promise that resolves once the microtask queue has drained.
 */
export async function flushPromises(): Promise<void> {
  await new Promise(realSetImmediate);
}

/**
 * It's common when writing tests to need an object which fits the shape of a
 * type. However, some properties are unimportant to a test, and so it's useful
 * if such properties can get filled in with defaults if not explicitly
 * provided, so that a complete version of that object can still be produced.
 *
 * A naive approach to doing this is to define those defaults and then mix them
 * in with overrides using the spread operator; however, this causes issues if
 * creating a default value causes a change in global test state — such as
 * causing a mocked function to get called inadvertently.
 *
 * This function solves this problem by allowing defaults to be defined lazily.
 *
 * @param defaults - An object where each value is wrapped in a function so that
 * it doesn't get evaluated unless `overrides` does not contain the key.
 * @param overrides - The values to override the defaults with.
 * @param finalizeObject - An optional function to call which will create the
 * final version of the object. This is useful if you need to customize how a
 * value receives its default version (say, if it needs be calculated based on
 * some other property).
 * @returns The complete version of the object.
 */
export function buildTestObject<Type extends Record<PropertyKey, unknown>>(
  defaults: { [Key in keyof Type]: () => Type[Key] },
  overrides: Partial<Type>,
  finalizeObject?: (object: Type) => Type,
): Type {
  const keys = [
    ...new Set([
      ...getKnownPropertyNames(defaults),
      ...getKnownPropertyNames<keyof Type>(overrides),
    ]),
  ];
  const object = keys.reduce<Type>((workingObject, key) => {
    if (key in overrides) {
      return { ...workingObject, [key]: overrides[key] };
    } else if (key in defaults) {
      return { ...workingObject, [key]: defaults[key]() };
    }
    return workingObject;
  }, {} as never);

  return finalizeObject ? finalizeObject(object) : object;
}

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
 * @param advanceTimersByTimeAsync - The active runner's
 * `advanceTimersByTimeAsync`, i.e. `jest.advanceTimersByTimeAsync` or
 * `vi.advanceTimersByTimeAsync`.
 * @param options - The options object.
 * @param options.duration - The total amount of time (in milliseconds) to advance the timer by.
 * @param options.stepSize - The incremental step size (in milliseconds) by which the timer is advanced in each iteration. Default is 1/4 of the duration.
 */
export async function advanceTimeWith(
  advanceTimersByTimeAsync: (ms: number) => Promise<unknown>,
  {
    duration,
    stepSize = duration / 4,
  }: {
    duration: number;
    stepSize?: number;
  },
): Promise<void> {
  let value = duration;
  do {
    await advanceTimersByTimeAsync(stepSize);
    value -= stepSize;
  } while (value > 0);
}
