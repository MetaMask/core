import { QuoteStatusFetchWithRetryOutcomeType } from './constants';
import { QuoteStatusUpdateResponse } from './types';

/**
 * Result of a retrying quote status update
 * ({@link QuoteStatusApiService.updateQuoteStatusWithRetry}).
 *
 * Represents how an update attempt resolved so callers can branch on the
 * outcome without having to re-interpret raw HTTP responses or thrown errors.
 * The discriminating {@link type} indicates whether the update was accepted,
 * hit a non-retryable error, was interrupted, or exhausted its retries. The
 * optional {@link response} carries the backend error payload (when present),
 * which callers use to reconcile local state for non-retryable errors.
 */
export class QuoteStatusUpdateWithRetryOutcome {
  /**
   * Discriminant describing how the update attempt resolved.
   */
  readonly type: QuoteStatusFetchWithRetryOutcomeType;

  /**
   * Backend error response associated with the outcome, when one was returned
   * (typically for {@link QuoteStatusUpdateWithRetryOutcomeType.NonRetryable}).
   */
  readonly response?: QuoteStatusUpdateResponse;

  /**
   * @param outcome - The outcome type describing how the update resolved.
   * @param response - Optional backend error response associated with the outcome.
   */
  constructor(
    outcome: QuoteStatusFetchWithRetryOutcomeType,
    response?: QuoteStatusUpdateResponse,
  ) {
    this.type = outcome;
    this.response = response;
  }
}
