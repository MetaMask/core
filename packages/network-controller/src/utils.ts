/**
 * Measure how long a function takes to run.
 *
 * @param fn - The function to run.
 * @returns The time in milliseconds it takes for the function to run.
 */
export async function measureTime(fn: () => Promise<unknown>) {
  const startTime = new Date();
  await fn();
  const endTime = new Date();
  return endTime.getTime() - startTime.getTime();
}
