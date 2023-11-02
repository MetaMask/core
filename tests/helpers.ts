/**
 * Resolve all pending promises.
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://jestjs.io/docs/timer-mocks.
 */
const flushPromises = () => {
  return new Promise(jest.requireActual('timers').setImmediate);
};

/**
 * Advances the provided fake timer by a specified duration in incremental steps.
 * Between each step, any enqueued promises are processed. This function is especially
 * useful for ensuring that chained promises and timers are fully processed within tests.
 * @param options - The options object.
 * @param options.clock - The Sinon fake timer instance used to manipulate time in tests.
 * @param options.duration - The total amount of time (in milliseconds) to advance the timer by.
 * @param options.stepSize - The incremental step size (in milliseconds) by which the timer is advanced in each iteration. Default is 2000ms.
 */
export async function advanceTime({
  clock,
  duration,
  stepSize,
}: {
  clock: sinon.SinonFakeTimers;
  duration: number;
  stepSize?: number;
}): Promise<void> {
  // if stepSize is not provided, default to 1/4 of the duration
  stepSize ??= duration / 4;
  do {
    await clock.tickAsync(stepSize);
    await flushPromises();
    duration -= stepSize;
  } while (duration > 0);
}
