export class SubscriptionServiceError extends Error {
  /**
   * The underlying error that caused this error.
   */
  cause?: Error;

  constructor(
    message: string,
    options?: {
      cause?: Error;
    },
  ) {
    super(message);
    this.name = 'SubscriptionServiceError';
    this.cause = options?.cause;
  }
}

/**
 * Get an error from a response.
 *
 * @param response - The response to get an error from.
 * @returns An error.
 */
export async function getErrorFromResponse(response: Response): Promise<Error> {
  const contentType = response.headers?.get('content-type');
  const statusCode = response.status;
  try {
    if (contentType?.includes('application/json')) {
      const json = await response.json();
      const errorMessage = json?.error ?? json?.message ?? 'Unknown error';
      const networkError = `error: ${errorMessage}, statusCode: ${statusCode}`;
      return new Error(networkError);
    } else if (contentType?.includes('text/plain')) {
      const text = await response.text();
      const networkError = `error: ${text}, statusCode: ${statusCode}`;
      return new Error(networkError);
    }

    const error =
      'data' in response && typeof response.data === 'string'
        ? response.data
        : 'Unknown error';
    const networkError = `error: ${error}, statusCode: ${statusCode}`;
    return new Error(networkError);
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
