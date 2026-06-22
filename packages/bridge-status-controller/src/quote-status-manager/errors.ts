import { QuoteStatusUpdateErrorDetails } from './types';

/**
 * Error thrown for quote status update failures.
 *
 * The error message is prefixed with the error type when provided, and
 * structured details are preserved on the instance for downstream handling.
 */
export class QuoteStatusUpdateError extends Error {
  readonly details?: QuoteStatusUpdateErrorDetails;

  /**
   * Creates a quote status update error with structured context.
   *
   * @param message - Human-readable error message.
   * @param details - Structured metadata about the failed quote update.
   * @param details.errorType - Optional category for known update failures.
   * @param details.quoteId - Unique quote identifier associated with the error.
   */
  constructor(message: string, details: QuoteStatusUpdateErrorDetails) {
    super(`${details.errorType ? `[${details.errorType}] ` : ''}${message}`);
    this.details = details;
    this.name = QuoteStatusUpdateError.name;
    Object.setPrototypeOf(this, QuoteStatusUpdateError.prototype);
  }
}
