import {
  QuoteResponse,
  QuoteResponseV1,
  QuoteMetadata,
  Trade,
  isQuoteResponseV2,
  toQuoteMetadataV1,
  toQuoteResponseV1,
} from '@metamask/bridge-controller';
import type { QuoteMetadataMigrationPhase } from '@metamask/bridge-controller';

/**
 * Convert quote responses to V1 format and preserve metadata for consistency
 * @param quoteResponsesV1orV2 - The quote responses to normalize
 * @param migrationPhase - The migration phase to use for the quote metadata
 * @returns - The normalized quote responses in V1 format
 */
export const normalizeQuoteResponses = (
  quoteResponsesV1orV2:
    | QuoteResponse[]
    | (QuoteResponseV1<Trade, Trade> & QuoteMetadata)[],
  migrationPhase?: QuoteMetadataMigrationPhase,
): (QuoteResponseV1 & QuoteMetadata)[] =>
  quoteResponsesV1orV2.map((quote) => {
    if (!isQuoteResponseV2(quote)) {
      return quote;
    }

    const quoteMetadataV1 = toQuoteMetadataV1(quote, migrationPhase);

    // This coercion omits legacy metadata from the resulting V1 quote
    const quoteResponseV1 = toQuoteResponseV1(quote);

    // Merge legacy-shaped metadata to V1-shaped quote response
    return { ...quoteResponseV1, ...quoteMetadataV1 };
  });
