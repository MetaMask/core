/**
 * Executes a network operation with retry logic for transient failures.
 *
 * @param operation - The async operation to execute.
 * @param operationName - Name of the operation for logging purposes.
 * @param maxRetries - Maximum number of retry attempts.
 * @param baseDelayMs - Base delay between retries in milliseconds.
 * @returns Promise that resolves with the operation result.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
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
        console.error(
          `${operationName} failed after ${maxRetries + 1} attempts:`,
          lastError.message,
        );
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `${operationName} failed on attempt ${attempt + 1}, retrying in ${delayMs}ms:`,
        lastError.message,
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
