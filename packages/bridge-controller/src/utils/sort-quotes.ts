/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { FeatureId } from '../validators/feature-flags.js';
import type { QuoteResponseV1 } from '../validators/quote-response-v1.js';

export const sortQuotes = (
  quotes: QuoteResponseV1[],
  featureId: FeatureId | null,
) => {
  // Sort perps quotes by increasing estimated processing time (fastest first)
  if (featureId === FeatureId.PERPS) {
    return quotes.sort((a, b) => {
      return (
        a.estimatedProcessingTimeInSeconds - b.estimatedProcessingTimeInSeconds
      );
    });
  }
  return quotes;
};
