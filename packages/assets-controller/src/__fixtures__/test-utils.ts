type WaitForOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

type WaitUntilStableOptions = WaitForOptions & {
  /** How long the snapshot has to stay unchanged before it counts as stable. */
  stableForMs?: number;
};

/**
 * Testing Utility - waitFor. Waits for and checks (at an interval) if assertion is reached.
 *
 * @param assertionFn - assertion function
 * @param options - set wait for options
 * @returns promise that you need to await in tests
 */
export const waitFor = async (
  assertionFn: () => void | Promise<void>,
  options: WaitForOptions = {},
): Promise<void> => {
  const { intervalMs = 50, timeoutMs = 2000 } = options;

  const startTime = Date.now();
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      await assertionFn();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  try {
    await assertionFn();
    return;
  } catch (error) {
    lastError = error;
  }

  const assertionDetail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `waitFor: timeout reached after ${timeoutMs}ms. Last assertion error: ${assertionDetail}`,
  );
};

/**
 * Testing Utility - waitUntilStable. Waits until a snapshot stops changing,
 * for tests that need background work to be finished rather than a particular
 * value to appear. Use it before asserting something is absent, so the
 * assertion cannot pass merely because the write has not landed yet.
 *
 * @param takeSnapshot - returns the value to watch; must be JSON-serializable
 * @param options - set wait for options
 * @returns promise that you need to await in tests
 */
export const waitUntilStable = async (
  takeSnapshot: () => unknown,
  options: WaitUntilStableOptions = {},
): Promise<void> => {
  const { intervalMs, stableForMs = 150, timeoutMs } = options;

  let snapshot = JSON.stringify(takeSnapshot());
  let stableSince = Date.now();

  await waitFor(
    () => {
      const current = JSON.stringify(takeSnapshot());
      if (current !== snapshot) {
        snapshot = current;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince < stableForMs) {
        throw new Error('snapshot is still changing');
      }
    },
    { intervalMs, timeoutMs },
  );
};
