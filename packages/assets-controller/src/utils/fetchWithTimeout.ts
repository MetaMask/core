/**
 * Race an async task against a timeout. The returned promise rejects with
 * `new Error('Fetch timed out after <n>ms')` when the timeout wins, letting
 * the caller handle timeouts identically to network errors.
 *
 * @param task - The async task to run (e.g. the raw API call).
 * @param timeoutMs - The timeout in milliseconds.
 * @returns The task's resolved value when it wins the race.
 */
export async function fetchWithTimeout<Value>(
  task: () => Promise<Value>,
  timeoutMs: number,
): Promise<Value> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
