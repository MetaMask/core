import { getKnownPropertyNames } from '@metamask/utils';

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
 * @param options.clock - The Sinon fake timer instance used to manipulate time in tests.
 * @param options.duration - The total amount of time (in milliseconds) to advance the timer by.
 * @param options.stepSize - The incremental step size (in milliseconds) by which the timer is advanced in each iteration. Default is 1/4 of the duration.
 */
export async function advanceTime({
  clock,
  duration,
  stepSize = duration / 4,
}: {
  clock: sinon.SinonFakeTimers;
  duration: number;
  stepSize?: number;
}): Promise<void> {
  do {
    await clock.tickAsync(stepSize);
    duration -= stepSize;
  } while (duration > 0);
}

/**
 * Resolve all pending promises.
 *
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 *
 * TODO: migrate this to @metamask/utils
 */
export async function flushPromises(): Promise<void> {
  await new Promise(jest.requireActual('timers').setImmediate);
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
  defaults: { [K in keyof Type]: () => Type[K] },
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
