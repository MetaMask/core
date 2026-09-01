/**
 * Returns a promise that resolves after the given number of milliseconds.
 *
 * @param ms - The number of milliseconds to wait before resolving.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
