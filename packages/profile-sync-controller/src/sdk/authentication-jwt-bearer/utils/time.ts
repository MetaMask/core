/**
 * Delays execution for the specified number of milliseconds.
 *
 * @param ms - Number of milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}
