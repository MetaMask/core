import { is } from '@metamask/superstruct';
import { merge } from 'lodash';

import type { QuoteResponse } from '../../validators/quote-response';
import { QuoteResponseSchemaV1 } from '../../validators/quote-response-v1';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1';
import { toNormalizedAmounts } from './to-normalized-amounts';
import { toQuoteMetadataV2 } from './to-quote-metadata-v2';
import type { QuoteMetadata } from './types';

/**
 * Merges legacy {@link QuoteMetadata} values into the {@link QuoteResponse}
 *
 * @param quoteResponse - The {@link QuoteResponse} or {@link QuoteResponseV1} to merge the metadata into
 * @param quoteMetadata - The {@link QuoteMetadata} values to merge
 * @returns The {@link QuoteResponse} with the metadata merged in
 */
export function mergeQuoteMetadata<
  QuoteType extends QuoteResponse | QuoteResponseV1 = QuoteResponse,
>(
  quoteResponse: QuoteType,
  quoteMetadata: QuoteMetadata,
): QuoteType & QuoteMetadata {
  if (is(quoteResponse, QuoteResponseSchemaV1)) {
    return merge({}, quoteResponse, quoteMetadata);
  }

  try {
    const quoteMetadataV2 = toQuoteMetadataV2(quoteMetadata, quoteResponse);
    const normalizedAmountsV2 = toNormalizedAmounts(quoteResponse);
    /*
     * Phase 1 of migration uses calcQuoteMetadata's results
     */
    return merge(
      {},
      quoteResponse,
      normalizedAmountsV2,
      quoteMetadataV2,
      quoteMetadata,
    );

    // TODO Phase 1.5 of migration uses calcQuoteMetadata's results as fallback
    // return merge(
    //   {},
    //   quoteMetadataV2,
    //   quoteResponse,
    //   normalizedAmountsV2,
    //   quoteMetadata,
    // );

    // TODO Phase 2 of migration only uses metadata from the API response
    // return merge({}, quoteResponse, normalizedAmountsV2);
  } catch (error) {
    console.error(error);
    return merge({}, quoteResponse, quoteMetadata);
  }
}
