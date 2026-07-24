import {
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusFetchWithRetryOutcomeType,
} from './constants.js';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome.js';
import type { QuoteStatusUpdateResponse } from './types.js';

describe('QuoteStatusUpdateWithRetryOutcome', () => {
  it('exposes the outcome type', () => {
    const outcome = new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.Accepted,
    );

    expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
  });

  it('leaves the response undefined when none is provided', () => {
    const outcome = new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
    );

    expect(outcome.response).toBeUndefined();
  });

  it('preserves the provided response', () => {
    const response: QuoteStatusUpdateResponse = {
      statusCode: 404,
      message: 'quote not found',
      type: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
    };

    const outcome = new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
      response,
    );

    expect(outcome.type).toBe(
      QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
    );
    expect(outcome.response).toStrictEqual(response);
  });
});
