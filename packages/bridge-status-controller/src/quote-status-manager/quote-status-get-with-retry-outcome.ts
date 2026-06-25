import { QuoteStatusFetchWithRetryOutcomeType } from './constants';
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

  /**
   * @param outcome - The outcome type describing how the fetch resolved.
   * @param response - Optional backend quote status payload when accepted.
   */
  constructor(
    outcome: QuoteStatusFetchWithRetryOutcomeType,
    response?: QuoteStatusGetResponse,
  ) {
    this.type = outcome;
    this.response = response;
  }
}
