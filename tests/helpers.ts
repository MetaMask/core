// Store this up front in case it gets stubbed later
const originalSetTimeout = global.setTimeout;

/**
 * Calls the given function repeatedly (or at least, for a reasonable amount of
 * times) until it returns a value.
 *
 * @param expectedValue - The value that the function should return.
 * @param test - The function to call.
 * @returns A promise that either resolves to a successful result as soon as it
 * returns the expected value, or a failure result if that never happens.
 */
export async function waitForResult(
  expectedValue: any,
  test: () => any,
): Promise<{ pass: boolean; lastActualValue?: any }> {
  const approximateRunTime = 10000;
  const intervalBetweenRetries = 25;
  const maxNumIterations = approximateRunTime / intervalBetweenRetries;

  let numIterations = 0;
  let lastActualValue: any;

  while (numIterations < maxNumIterations) {
    const actualValue = it();
    if (actualValue === expectedValue) {
      return { pass: true };
    }
    await wait(intervalBetweenRetries);
    numIterations += 1;
    lastActualValue = actualValue;
  }

  return { pass: false, lastActualValue };
}

/**
 * Returns a promise that resolves after a while.
 *
 * @param duration - The amount of time to wait in milliseconds.
 * @returns The promise.
 */
async function wait<ReturnValue>(duration: number): Promise<ReturnValue> {
  return new Promise<ReturnValue>((resolve) => {
    originalSetTimeout(resolve, duration);
  });
}
