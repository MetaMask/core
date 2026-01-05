/**
 * Get an error from a response.
 *
 * @param response - The response to get an error from.
 * @returns An error.
 */
export async function getErrorFromResponse(response: Response): Promise<Error> {
  const statusCode = response.status;
  try {
    const json = await response.json();
    const message = `error: ${json.error}, statusCode: ${statusCode}`;
    return new Error(message);
  } catch {
    return new Error(`HTTP ${statusCode} error`);
  }
}

/**
 * Creates an error instance with a readable message and the root cause.
 *
 * @param message - The error message to create a Sentry error from.
 * @param cause - The inner error to create a Sentry error from.
 * @returns A Sentry error.
 */
export function createSentryError(message: string, cause: Error): Error {
  const sentryError = new Error(message) as Error & {
    cause: Error;
  };
  sentryError.cause = cause;

  return sentryError;
}
