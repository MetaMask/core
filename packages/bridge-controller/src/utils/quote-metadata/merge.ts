import { merge } from 'lodash';

import type { DeepPartial } from '../../types.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2.js';
import type { QuoteMetadata } from './types.js';
import { QuoteMetadataMigrationPhase } from './types.js';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} to merge the metadata into
 * @param legacyQuoteMetadata - The {@link QuoteMetadata} values to merge
 * @param migrationPhase - The active {@link QuoteMetadataMigrationPhase}
 * @param currencyValues - The amounts in the user's currency, derived from the backend's `usd` values
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata(
  quoteResponse: QuoteResponse,
  legacyQuoteMetadata: QuoteMetadata = {},
  migrationPhase: QuoteMetadataMigrationPhase = QuoteMetadataMigrationPhase.V1Data,
  currencyValues?: DeepPartial<QuoteResponse>,
): QuoteResponse & QuoteMetadata {
  const normalizedAmounts = toNormalizedAmounts(quoteResponse);

  if (migrationPhase === QuoteMetadataMigrationPhase.V2Only) {
    return merge({}, quoteResponse, normalizedAmounts, currencyValues);
  }

  const legacyQuoteMetadataV2 = toQuoteMetadataV2(
    legacyQuoteMetadata,
    quoteResponse,
  );

  if (migrationPhase === QuoteMetadataMigrationPhase.V2WithV1Fallback) {
    return merge(
      {},
      legacyQuoteMetadataV2,
      legacyQuoteMetadata,
      quoteResponse,
      normalizedAmounts,
      currencyValues,
    );
  }

  return merge(
    {},
    quoteResponse,
    normalizedAmounts,
    legacyQuoteMetadataV2,
    legacyQuoteMetadata,
  );
}
