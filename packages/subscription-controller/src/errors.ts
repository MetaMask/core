export type SubscriptionServiceErrorDetails = Record<string, unknown>;

export class SubscriptionServiceError extends Error {
  /**
   * The underlying error that caused this error.
   */
  cause?: Error;

  /**
   * Additional details about the error.
   */
  details?: SubscriptionServiceErrorDetails;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      details?: SubscriptionServiceErrorDetails;
    },
  ) {
    super(message);
    this.name = 'SubscriptionServiceError';
    this.details = options?.details;
    this.cause = options?.cause;
  }
}
