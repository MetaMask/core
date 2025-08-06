/**
 * Executes a network operation with retry logic for transient failures.
 *
 * @param operation - The async operation to execute.
 * @param maxRetries - Maximum number of retry attempts.
 * @param baseDelayMs - Base delay between retries in milliseconds.
 * @returns Promise that resolves with the operation result.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = baseDelayMs * Math.pow(2, attempt);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
