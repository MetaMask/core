import { QuoteStatusFetchWithRetryOutcomeType } from './constants';
import { QuoteStatusGetError } from './errors';
import { QuoteStatusGetResponse } from './types';

/**
 * Result of a retrying quote status fetch
 * ({@link QuoteStatusApiService.getQuoteStatusWithRetry}).
 *
 * Represents how a fetch attempt resolved so callers can branch on the
 * outcome without having to re-interpret raw HTTP responses or thrown errors.
 * The discriminating {@link type} indicates whether the fetch was accepted,
 * was interrupted, or exhausted its retries. The optional {@link response}
 * carries the backend quote status payload when the fetch succeeded.
 */
export class QuoteStatusGetWithRetryOutcome {
  /**
   * Discriminant describing how the fetch attempt resolved.
   */
  readonly type: QuoteStatusFetchWithRetryOutcomeType;

  /**
   * Backend quote status payload when the fetch was accepted
   * ({@link QuoteStatusFetchWithRetryOutcomeType.Accepted}).
   */
  readonly response?: QuoteStatusGetResponse;

  readonly error?: QuoteStatusGetError;

  /**
   * @param outcome - The outcome type describing how the fetch resolved.
   * @param response - Optional backend quote status payload when accepted.
   * @param error - Optional quote status fetch error when the outcome is non-retryable.
   */
  constructor(
    outcome: QuoteStatusFetchWithRetryOutcomeType,
    response?: QuoteStatusGetResponse,
    error?: QuoteStatusGetError,
  ) {
    this.type = outcome;
    this.response = response;
    this.error = error;
  }
}
