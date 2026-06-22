import {
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusUpdateWithRetryOutcomeType,
} from './constants';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
import type { QuoteStatusUpdateResponse } from './types';

describe('QuoteStatusUpdateWithRetryOutcome', () => {
  it('exposes the outcome type', () => {
    const outcome = new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusUpdateWithRetryOutcomeType.Accepted,
    );

    expect(outcome.type).toBe(QuoteStatusUpdateWithRetryOutcomeType.Accepted);
  });

  it('leaves the response undefined when none is provided', () => {
    const outcome = new QuoteStatusUpdateWithRetryOutcome(
      QuoteStatusUpdateWithRetryOutcomeType.RetryableExhausted,
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
      QuoteStatusUpdateWithRetryOutcomeType.NonRetryable,
      response,
    );

    expect(outcome.type).toBe(
      QuoteStatusUpdateWithRetryOutcomeType.NonRetryable,
    );
    expect(outcome.response).toStrictEqual(response);
  });
});
