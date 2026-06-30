import { StatusTypes } from '@metamask/bridge-controller';

import { QuoteStatusFetchWithRetryOutcomeType } from './constants';
import { QuoteStatusGetError } from './errors';
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

  it('leaves the error undefined when none is provided', () => {
    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
    );

    expect(outcome.error).toBeUndefined();
  });

  it('preserves the provided response', () => {
    const response: QuoteStatusGetResponse = {
      submittedTx: {
        status: StatusTypes.SUBMITTED,
        srcChain: {
          chainId: 1,
        },
      },
    };

    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.Accepted,
      response,
    );

    expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
    expect(outcome.response).toStrictEqual(response);
  });

  it('preserves the provided error', () => {
    const error = new QuoteStatusGetError('request error to getQuoteStatus', {
      quoteId: 'quote-1',
    });

    const outcome = new QuoteStatusGetWithRetryOutcome(
      QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
      undefined,
      error,
    );

    expect(outcome.type).toBe(
      QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
    );
    expect(outcome.response).toBeUndefined();
    expect(outcome.error).toBe(error);
  });
});
