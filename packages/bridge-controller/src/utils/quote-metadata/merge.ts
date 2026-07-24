import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import type { QuoteResponse } from '../../validators/quote-response.js';
import { QuoteResponseSchemaV1 } from '../../validators/quote-response-v1.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import { toNormalizedAmounts } from './to-normalized-amounts.js';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2.js';
import type { QuoteMetadata } from './types.js';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} or {@link QuoteResponseV1} to merge the metadata into
 * @param legacyQuoteMetadata - The {@link QuoteMetadata} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata<
  QuoteType extends QuoteResponse | QuoteResponseV1 = QuoteResponse,
>(
  quoteResponse: QuoteType,
  legacyQuoteMetadata: QuoteMetadata,
): QuoteType & QuoteMetadata {
  if (is(quoteResponse, QuoteResponseSchemaV1)) {
    return merge({}, quoteResponse, legacyQuoteMetadata);
  }

  const legacyQuoteMetadatV2 = toQuoteMetadataV2(
    legacyQuoteMetadata,
    quoteResponse,
  );
  const normalizedAmountsV2 = toNormalizedAmounts(quoteResponse);
  // Phase 1 of migration uses calcQuoteMetadata's results
  return merge(
    {},
    quoteResponse,
    normalizedAmountsV2,
    legacyQuoteMetadatV2,
    legacyQuoteMetadata, // return for client testing
  );
}
