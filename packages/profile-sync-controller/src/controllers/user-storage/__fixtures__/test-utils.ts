type WaitForOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

/**
 * Testing Utility - waitFor. Waits for and checks (at an interval) if assertion is reached.
 *
 * @param assertionFn - assertion function
 * @param options - set wait for options
 * @returns promise that you need to await in tests
 */
export const waitFor = async (
  assertionFn: () => void,
  options: WaitForOptions = {},
): Promise<void> => {
  const { intervalMs = 50, timeoutMs = 2000 } = options;

  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    const intervalId = setInterval(() => {
      try {
        assertionFn();
        clearInterval(intervalId);
        resolve();
      } catch (error) {
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(intervalId);
          reject(new Error(`waitFor: timeout reached after ${timeoutMs}ms`));
        }
      }
    }, intervalMs);
  });
};
