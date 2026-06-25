import { StatusTypes } from '@metamask/bridge-controller';

import { QuoteStatusFetchWithRetryOutcomeType } from './constants';
import { QuoteStatusGetWithRetryOutcome } from './quote-status-get-with-retry-outcome';
import type { QuoteStatusGetResponse } from './types';

describe('QuoteStatusGetWithRetryOutcome', () => {
  it('exposes the outcome type', () => {
    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.Accepted,
    );

    expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
  });

  it('leaves the response undefined when none is provided', () => {
    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
    );

    expect(outcome.response).toBeUndefined();
  });

  it('preserves the provided response', () => {
    const response: QuoteStatusGetResponse = {
      submittedTx: {
        status: StatusTypes.SUBMITTED,
      },
    };

    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.Accepted,
      response,
    );

    expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
    expect(outcome.response).toStrictEqual(response);
  });
});
