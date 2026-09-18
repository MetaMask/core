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
    let lastError: unknown;
    const intervalId = setInterval(() => {
      try {
        assertionFn();
        clearInterval(intervalId);
        resolve();
      } catch (error) {
        lastError = error;
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(intervalId);
          const assertionDetail =
            lastError instanceof Error ? lastError.message : String(lastError);
          reject(
            new Error(
              `waitFor: timeout reached after ${timeoutMs}ms. Last assertion error: ${assertionDetail}`,
            ),
          );
        }
      }
    }, intervalMs);
  });
};
