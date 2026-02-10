import { SubscriptionApiError } from './types';

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
export async function getSubscriptionErrorFromResponse(
  response: Response,
): Promise<Error> {
  const contentType = response.headers?.get('content-type');
  const statusCode = response.status;
  try {
    if (contentType?.includes('application/json')) {
      const json = (await response.json()) as SubscriptionApiError;
      const subscriptionApiErrorMessage = composeSubscriptionApiErrorMessage(
        json,
        statusCode,
      );
      return new Error(subscriptionApiErrorMessage);
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

/**
 * Compose an error message from a Subscription API error.
 *
 * @param error - The Subscription API error to compose an error message from.
 * @returns An error message.
 * @param statusCode - The status code of the response.
 */
export function composeSubscriptionApiErrorMessage(
  error: SubscriptionApiError,
  statusCode: number,
): string {
  let baseErrorMessage = `error: ${error.message ?? 'Unknown error'}, statusCode: ${statusCode ?? 'Unknown status code'}`;
  if (error.errorCode) {
    baseErrorMessage += `, errorCode: ${error.errorCode}`;
  }
  return baseErrorMessage;
}
