/**
 * Wait the specified number of milliseconds.
 *
 * @param duration - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified amount of time.
 */
export async function timeout(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
