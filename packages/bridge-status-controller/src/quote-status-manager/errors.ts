import {
  QuoteStatusGetErrorDetails,
  QuoteStatusUpdateErrorDetails,
} from './types';

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
   * @param details.txMetaId - Optional transaction metadata id associated with
   * the error.
   * @param details.srcTxHash - Optional source-chain transaction hash
   * associated with the error.
   * @param details.srcChainId - Optional source-chain id associated with the
   * error.
   */
  constructor(message: string, details: QuoteStatusUpdateErrorDetails) {
    super(`${details.errorType ? `[${details.errorType}] ` : ''}${message}`);
    this.details = details;
    this.name = QuoteStatusUpdateError.name;
    Object.setPrototypeOf(this, QuoteStatusUpdateError.prototype);
  }
}

/**
 * Error thrown for quote status fetch failures.
 *
 * Structured details are preserved on the instance for downstream handling.
 */
export class QuoteStatusGetError extends Error {
  readonly details?: QuoteStatusGetErrorDetails;

  /**
   * Whether the error is transient and the request may succeed on a retry.
   *
   * `true` for 5xx (server-side) HTTP errors; `false` for 4xx (client-side)
   * errors and response-validation failures.
   */
  readonly retryable: boolean;

  /**
   * Creates a quote status fetch error with structured context.
   *
   * @param message - Human-readable error message.
   * @param details - Structured metadata about the failed quote status fetch.
   * @param details.quoteId - Unique quote identifier associated with the error.
   * @param retryable - Whether the error is transient and may resolve on retry.
   * Defaults to `false`.
   */
  constructor(
    message: string,
    details: QuoteStatusGetErrorDetails,
    retryable = false,
  ) {
    super(message);
    this.details = details;
    this.retryable = retryable;
    this.name = QuoteStatusGetError.name;
    Object.setPrototypeOf(this, QuoteStatusGetError.prototype);
  }
}
